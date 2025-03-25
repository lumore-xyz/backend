// /controllers/profileController.js
import mongoose from "mongoose";
import RejectedProfile from "../models/RejectedProfile.js";
import Slot from "../models/Slot.js";
import UnlockHistory from "../models/UnlockHistory.js";
import User from "../models/User.js";
import UserPhotos from "../models/UserPhotos.js";
import UserPreference from "../models/UserPreference.js";

// Create or Update Profile
export const createProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const allowedFields = [
      "username",
      "nickname",
      "realName",
      "visibleName",
      "hiddenName",
      "gender",
      "sexualOrientation",
      "dob",
      "height",
      "bio",
      "interests",
      "diet",
      "zodiacSign",
      "lifestyle",
      "lifestyle.drinking",
      "lifestyle.smoking",
      "lifestyle.pets",
      "work",
      "work.title",
      "work.company",
      "education",
      "education.degree",
      "education.institution",
      "education.field",
      "maritalStatus",
      "religion",
      "currentLocation",
      "homeTown",
      "languages",
      "personalityType",
      "profilePicture",
      "isVerified",
      "verificationMethod",
      "verificationStatus",
      "isActive",
      "lastActive",
      "maxSlots",
      "location",
      "location.coordinates",
      "location.formattedAddress",
      "fieldVisibility",
      "dailyConversations",
      "lastConversationReset",
      "activeMatch",
      "savedChats",
    ];

    // Extract only allowed fields
    const updateData = Object.keys(req.body)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    // Update the user profile and return updated data
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true, // Return updated user
      runValidators: true, // Ensure validation runs
      upsert: false, // Prevent creating new user if not found
    }).select("-password -__v"); // Exclude sensitive fields

    if (!updatedUser)
      return res.status(404).json({ message: "User not found" });

    await updatedUser.updateLastActive();
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update User Preferences
export const updateUserPreference = async (req, res) => {
  try {
    const userId = req.user.id;
    const { gender, ageRange, distance, goal } = req.body;

    let preferences = await UserPreference.findOne({ user: userId });

    if (!preferences) {
      // Create new preferences if not found
      preferences = new UserPreference({ user: userId });
    }

    // Update preference fields
    if (gender) preferences.gender = gender;
    if (ageRange) preferences.ageRange = ageRange;
    if (distance) preferences.distance = distance;
    if (goal) preferences.goal = goal;

    await preferences.save();
    await User.findById(userId).updateLastActive();

    res
      .status(200)
      .json({ message: "Preferences updated successfully", preferences });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Profile
export const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user.id;

    // Fetch user profile without the password
    const user = await User.findById(userId).lean().select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch viewer's profile to access location
    const viewer = await User.findById(viewerId).lean().select("location");
    if (!viewer || !user.location) {
      return res.status(400).json({ message: "Location data missing" });
    }

    // Calculate distance between the viewer and the profile owner
    const distance = calculateDistance(viewer.location, user.location);

    // Fetch user's photos
    const photos = await UserPhotos.find({ user: userId }).select("photoUrl");

    // Check if the profile is unlocked by the viewer
    const isUnlocked = await UnlockHistory.exists({
      user: viewerId,
      unlockedUser: userId,
    });

    // Prepare profile data based on visibility settings
    let profileData = {
      _id: user._id,
      visibleName: user.visibleName,
      distance,
    };

    // If viewing own profile, show all fields
    if (userId === viewerId) {
      profileData = {
        ...user,
        photos,
        distance,
      };
    } else {
      // Check visibility settings for each field
      const fieldVisibility = user.fieldVisibility || new Map();

      // Add fields based on visibility settings
      Object.entries(user).forEach(([field, value]) => {
        if (
          field === "fieldVisibility" ||
          field === "password" ||
          field === "__v"
        ) {
          return; // Skip internal fields
        }

        const visibility = fieldVisibility.get(field) || "public";

        if (
          visibility === "public" ||
          (visibility === "unlocked" && isUnlocked) ||
          userId === viewerId
        ) {
          profileData[field] = value;
        }
      });

      // Handle photos based on unlock status
      profileData.photos = isUnlocked ? photos : blurPhotos(photos);
    }

    return res.status(200).json(profileData);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Get Next Profile (Matchmaking)
export const getNextProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Get user preferences
    const preferences = await UserPreference.findOne({ user: user._id });
    if (!preferences)
      return res.status(400).json({ message: "Preferences not set" });

    // Fetch rejected profiles
    const rejectedProfiles = await RejectedProfile.find({
      user: user._id,
    }).select("rejectedUser");
    const rejectedUserIds = rejectedProfiles.map((r) => r.rejectedUser);

    // Profile filtering
    const filter = {
      _id: { $ne: user._id, $nin: rejectedUserIds },
      dob: {
        $gte: new Date(
          new Date().setFullYear(
            new Date().getFullYear() - preferences.ageRange.max
          )
        ),
        $lte: new Date(
          new Date().setFullYear(
            new Date().getFullYear() - preferences.ageRange.min
          )
        ),
      },
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: user.location.coordinates },
          $maxDistance: preferences.distance * 1000, // Convert km to meters
        },
      },
    };

    if (preferences.gender !== "Any") {
      filter.gender = preferences.gender;
    }

    const profiles = await User.find(filter).limit(1);
    if (profiles.length === 0)
      return res.status(404).json({ message: "No profiles found" });

    const profile = profiles[0];

    res.status(200).json({
      _id: profile._id,
      visibleName: profile.visibleName,
      age: profile.age,
      gender: profile.gender,
      distance: calculateDistance(
        user.location.coordinates,
        profile.location.coordinates
      ),
      photo: blurPhotos(
        await UserPhotos.find({ user: profile._id }).select("photoUrl")
      ),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Like Profile (Save to Slot)
export const likeProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { profileId } = req.body;

    const user = await User.findById(userId);
    const profile = await User.findById(profileId);
    if (!user || !profile)
      return res.status(404).json({ message: "User or profile not found" });

    // Check if profile is already saved in a slot
    const existingSlot = await Slot.findOne({
      user: userId,
      profile: profileId,
    });
    if (existingSlot)
      return res.status(400).json({ message: "Profile already saved" });

    // Get user's slots and find a free one
    const slots = await Slot.find({ user: userId });
    const freeSlot = slots.find((slot) => !slot.profile);
    if (!freeSlot)
      return res.status(400).json({ message: "No available slots" });

    // Assign profile to the free slot
    freeSlot.profile = profileId;
    await freeSlot.save();
    await user.updateLastActive();

    res.status(200).json({ message: "Profile added to slot", slot: freeSlot });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject Profile
export const rejectProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { profileId, reason, feedback } = req.body;

    const user = await User.findById(userId);
    const profile = await User.findById(profileId);
    if (!user || !profile)
      return res.status(404).json({ message: "User or profile not found" });

    await RejectedProfile.create({
      user: userId,
      rejectedUser: profileId,
      reason,
      feedback,
    });
    await user.updateLastActive();

    res.status(200).json({ message: "Profile rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unlock Profile
export const unlockProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { profileId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await UnlockHistory.create({ user: userId, unlockedUser: profileId });
    await user.updateLastActive();

    res.status(200).json({ message: "Profile unlocked" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function to blur photos
export const blurPhotos = (photos) => {
  return photos.map((p) => ({ photoUrl: `${p.photoUrl}?blur=10` }));
};

// 1️⃣ Buy Slot (Mock Payment)
export const buySlot = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Limit to 10 slots max
    const userSlots = await Slot.countDocuments({ user: userId });
    if (userSlots >= 10) {
      return res.status(400).json({ message: "Max slot limit reached (10)" });
    }

    // TODO: Integrate real payment system (Stripe, Razorpay)
    const paymentSuccessful = true; // Simulate payment success

    if (!paymentSuccessful) {
      return res.status(402).json({ message: "Payment failed" });
    }

    // Create a new slot
    const newSlot = new Slot({ user: userId, profile: null });
    await newSlot.save();

    // Increase maxSlots count in user model (optional)
    user.maxSlots += 1;
    await user.save();
    await user.updateLastActive();

    res
      .status(200)
      .json({ message: "Slot purchased successfully", slot: newSlot });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 2️⃣ Get User Slots
export const getUserSlots = async (req, res) => {
  try {
    const userId = req.user.id;
    const slots = await Slot.find({ user: userId }).populate("profile");

    res.status(200).json({ slots });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const findMatch = async (socketId, userId) => {
  try {
    // 1️⃣ **Fetch User & Preferences**
    const user = await User.findById(userId);
    if (!user) return null;

    const preferences = await UserPreference.findOne({ user: userId });
    if (!preferences) return null;

    // 2️⃣ **Fetch Rejected Users**
    const rejectedProfiles = await RejectedProfile.find({
      user: userId,
    }).select("rejectedUser");
    const rejectedUserIds = rejectedProfiles.map((r) =>
      r.rejectedUser.toString()
    );

    let bestMatch = { socketId: null, profile: null, score: -1 };

    for (const [otherSocketId, profile] of waitingPool.entries()) {
      if (
        socketId === otherSocketId ||
        rejectedUserIds.includes(profile._id.toString())
      ) {
        continue; // Skip if same user or rejected
      }

      let score = 0;

      // Scoring Weights (Adjustable)
      const weights = {
        interests: 3,
        sexualOrientation: 2,
        primaryGoal: 2,
        genderMatch: 2,
        ageMatch: 2,
        distanceMatch: 2,
      };

      // 3️⃣ **Interest Matching**
      if (profile.interests?.hobbies && user.interests?.hobbies) {
        const sharedInterests = profile.interests.hobbies.filter((i) =>
          user.interests.hobbies.includes(i)
        ).length;
        score += sharedInterests * weights.interests;
      }

      // 4️⃣ **Sexual Orientation & Goal Matching**
      if (profile.sexualOrientation === user.sexualOrientation)
        score += weights.sexualOrientation;
      if (profile.goal?.primary === preferences.goal?.primary)
        score += weights.primaryGoal;

      // 5️⃣ **Gender & Preference Matching**
      if (profile.gender === preferences.gender) score += weights.genderMatch;
      if (user.gender === profile.preferences?.gender)
        score += weights.genderMatch;

      // 6️⃣ **Age Matching**
      const age = calculateAge(profile.dob);
      if (age >= preferences.ageRange.min && age <= preferences.ageRange.max) {
        score += weights.ageMatch;
      }

      // 7️⃣ **Distance Matching**
      if (profile.location?.coordinates && user.location?.coordinates) {
        const distance = calculateDistance(
          profile.location.coordinates,
          user.location.coordinates
        );
        if (distance <= preferences.distance) {
          score += weights.distanceMatch;
        }
      }

      // 8️⃣ **Update Best Match**
      if (score > bestMatch.score) {
        bestMatch = { socketId: otherSocketId, profile, score };
      }
    }

    // Fetch photos for the matched profile
    if (bestMatch.profile) {
      bestMatch.profile.photos = await UserPhotos.find({
        user: bestMatch.profile._id,
      }).select("photoUrl");
    }

    return bestMatch.profile ? bestMatch : null;
  } catch (error) {
    console.error("Error in findMatch:", error);
    return null;
  }
};

// Helper function to calculate age
export const calculateAge = (dob) => {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
};

// Helper function to calculate distance
export const calculateDistance = (location1, location2) => {
  // Extract coordinates from GeoJSON Point structure
  const [lon1, lat1] = location1.coordinates;
  const [lon2, lat2] = location2.coordinates;

  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// Update Field Visibility Settings
export const updateFieldVisibility = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fields } = req.body;

    if (!fields || typeof fields !== "object") {
      return res.status(400).json({
        message:
          "Invalid input. Expected fields object with visibility settings",
      });
    }

    const validVisibilities = ["public", "unlocked", "private"];
    const invalidFields = Object.entries(fields).filter(
      ([_, visibility]) => !validVisibilities.includes(visibility)
    );

    if (invalidFields.length > 0) {
      return res.status(400).json({
        message:
          "Invalid visibility value. Must be 'public', 'unlocked', or 'private'",
        invalidFields: invalidFields.map(([field]) => field),
      });
    }

    // Fetch user to get current fieldVisibility
    const user = await User.findById(userId, "fieldVisibility");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Merge existing fieldVisibility with new values
    const updatedVisibility = { ...user.fieldVisibility, ...fields };

    // Update in DB
    user.fieldVisibility = updatedVisibility;
    await user.save();
    await user.updateLastActive();

    res.status(200).json({
      message: "Field visibility updated successfully",
      fieldVisibility: updatedVisibility,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle profile visibility for a match
// @route   POST /api/profile/toggle-visibility/:matchId
// @access  Private
export const toggleProfileVisibility = async (req, res) => {
  try {
    const { isVisible } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.fieldVisibility = isVisible;
    await user.save();

    res.json({ fieldVisibility: isVisible });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get Rejection History
export const getRejectionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const rejections = await RejectedProfile.find({ user: userId })
      .populate("rejectedUser", "visibleName profilePicture")
      .sort({ createdAt: -1 });

    res.status(200).json(rejections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Rejection Analytics
export const getRejectionAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const analytics = await RejectedProfile.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json(analytics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
