// /controllers/profileController.js
import RejectedProfile from "../models/RejectedProfile.js";
import Slot from "../models/Slot.js";
import UnlockHistory from "../models/UnlockHistory.js";
import User from "../models/User.js";
import UserPhotos from "../models/UserPhotos.js";
import UserPreference from "../models/UserPreference.js";
import cloudinary from "../utils/cloudinary.js";

// Create or Update Profile
export const createUpdateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const allowedFields = [
      "username",
      "nickname",
      "realName",
      "phoneNumber",
      "gender",
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
      "institution",
      "maritalStatus",
      "religion",
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
      "bloodGroup",
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

/**
 * Update user location
 * POST /api/location
 */
export const updateUserLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, formattedAddress } = req.body;

    // Validate input
    if (
      !userId ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return res.status(400).json({
        success: false,
        message: "userId, latitude, and longitude are required",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update location using the model method
    await user.updateLocation(latitude, longitude, formattedAddress);

    res.json({
      success: true,
      message: "Location updated",
      data: {
        location: user.location,
        lastLocationUpdate: user.lastLocationUpdate,
      },
    });
  } catch (error) {
    console.error("[Location] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const findNearbyUsers = async (req, res) => {
  try {
    const { userId } = req.params;
    let preferences = await UserPreference.findOne({ user: userId });
    const maxDistance = (preferences?.distance || 10) * 1000;

    const user = await User.findById(userId);
    if (!user || !user.hasValidLocation()) {
      return res.status(400).json({
        success: false,
        message: "User not found or location not set",
      });
    }

    const [lng, lat] = user.location.coordinates;

    // Use the static method for finding nearby users
    const nearbyUsers = await User.findNearby(
      lng,
      lat,
      maxDistance,
      {
        // isActive: true
      }, // additional filters
      userId
    );

    res.json({
      success: true,
      data: {
        total: nearbyUsers.length,
        maxDistance: maxDistance,
        users: nearbyUsers.map((u) => ({
          id: u._id,
          username: u.username,
          gender: u.gender,
          age: u.age,
          distance: Math.round(u.distance),
          bio: u.bio,
        })),
      },
    });
  } catch (error) {
    console.error("[Nearby] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateProfilePicture = async (req, res) => {
  try {
    const userId = req.user?.id;
    const file = req.file;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "profile_pictures",
        format: "webp", // force WebP output
        transformation: [
          { fetch_format: "auto" }, // best format (webp/avif/etc.)
          { quality: "auto" }, // optimized quality
          { crop: "limit", width: 600, height: 600 }, // optional size limit
        ],
      },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary Upload Error:", error);
          return res.status(500).json({ message: "Upload failed" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.profilePicture = result.secure_url;
        await user.save();

        return res.status(200).json({
          message: "Profile picture updated successfully",
          profilePicture: result.secure_url,
        });
      }
    );

    uploadStream.end(file.buffer);
  } catch (error) {
    console.error("Error updating profile picture:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Update User Preferences
export const updateUserPreference = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      interestedIn,
      ageRange,
      distance,
      goal,
      interests,
      relationshipType,
      languages,
      zodiacPreference,
      personalityTypePreference,
      dietPreference,
    } = req.body;

    let preferences = await UserPreference.findOne({ user: userId });

    if (!preferences) {
      // Create new preferences if not found
      preferences = new UserPreference({ user: userId });
    }

    // Update preference fields
    if (interestedIn) preferences.interestedIn = interestedIn;
    if (ageRange) preferences.ageRange = ageRange;
    if (distance) preferences.distance = distance;
    if (goal) preferences.goal = goal;
    if (interests) preferences.interests = interests;
    if (relationshipType) preferences.relationshipType = relationshipType;
    if (languages) preferences.languages = languages;
    if (zodiacPreference) preferences.zodiacPreference = zodiacPreference;
    if (personalityTypePreference)
      preferences.personalityTypePreference = personalityTypePreference;
    if (dietPreference) preferences.dietPreference = dietPreference;

    await preferences.save();

    res
      .status(200)
      .json({ message: "Preferences updated successfully", preferences });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// get user prefrence
export const getUserPrefrence = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).lean().select("-password");
    if (!user) {
      throw new Error("User does not exist");
    }
    let preferences = await UserPreference.findOne({ user: userId });
    if (!preferences) {
      // Create new preferences if not found
      preferences = new UserPreference({ user: userId });
      await preferences.save();
    }

    res.status(200).json(preferences);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Profile
export const getProfile = async (req, res) => {
  try {
    const { userId } = req.params; // profile
    const viewerId = req.user.id; // logedin user

    if (!userId || !viewerId) {
      return res.status(400).json({ message: "Invalid request" });
    }

    // Fetch user profile without password
    const user = await User.findById(userId).lean().select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch viewer's profile to access location
    const viewer = await User.findById(viewerId).lean().select("location");
    if (!viewer || !viewer.location || !user.location) {
      return res.status(400).json({ message: "Location data missing" });
    }

    // Calculate distance between viewer and user
    const distance = calculateDistance(viewer.location, user.location);

    // Fetch user's photos
    const photos = await UserPhotos.find({ user: userId }).select("photoUrl");

    // Check if profile is unlocked by viewer
    const isViewerUnlockedByUser =
      (await UnlockHistory.countDocuments({
        user: userId, // The viewer (from req.user.id)
        unlockedUser: viewerId, // The profile being viewed (from params)
      })) > 0;
    const isViewerUnlockedUser =
      (await UnlockHistory.countDocuments({
        user: viewerId, // The profile being viewed (from params)
        unlockedUser: userId, // The viewer (from req.user.id)
      })) > 0;

    // Prepare profile data
    let profileData = {
      _id: user._id,
      distance,
      isViewerUnlockedByUser,
      isViewerUnlockedUser,
    };

    // If the viewer is the profile owner, return full profile
    if (userId === viewerId) {
      profileData = {
        ...user,
        photos,
        distance,
        isViewerUnlockedByUser: true,
        isViewerUnlockedUser: true,
      };
    } else {
      // Ensure fieldVisibility is an object
      const fieldVisibility = user.fieldVisibility || {};

      // Add fields based on visibility settings
      Object.entries(user).forEach(([field, value]) => {
        if (["fieldVisibility", "password", "__v"].includes(field)) return;

        const visibility = fieldVisibility[field] || "public";

        if (
          visibility === "public" ||
          (visibility === "unlocked" && isViewerUnlockedByUser)
        ) {
          profileData[field] = value;
        }
      });

      profileData.realName = isViewerUnlockedByUser ? user.realName : null;
      // Handle photos based on unlock status
      profileData.photos = isViewerUnlockedByUser ? photos : null;
    }

    return res.status(200).json(profileData);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ message: "Server error" });
  }
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

// Delete Account
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete user's data
    await Promise.all([
      User.findByIdAndDelete(userId),
      Slot.deleteMany({ user: userId }),
      UnlockHistory.deleteMany({ user: userId }),
      UserPhotos.deleteMany({ user: userId }),
      UserPreference.deleteOne({ user: userId }),
      RejectedProfile.deleteMany({ user: userId }),
    ]);

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
