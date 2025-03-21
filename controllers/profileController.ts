// /controllers/profileController.js
import { RequestUser } from "../types/request.js";
import RejectedProfiles from "../models/RejectedProfiles.js";
import Slot from "../models/Slot.js";
import UnlockHistory from "../models/UnlockHistory.js";
import User from "../models/User.js";
import UserPhotos from "../models/UserPhotos.js";
import UserPreference from "../models/UserPreference.js";
import { Request, Response } from "express";
import { waitingPool } from "../server.js";
import { IFilter, IUser, ProfileData } from "../types/index.js";

type UpdateData = {
  [key: string]: any;
};

type MatchProfile = {
  socketId: string | null;
  profile: (IUser & { photos?: any[] }) | null;
  score: number;
};

// Create or Update Profile
export const createProfile = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    const allowedFields = [
      "visibleName",
      "hiddenName",
      "gender",
      "dob",
      "bio",
      "interests",
      "location",
    ];

    // Extract only allowed fields
    const updateData = Object.keys(req.body)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj: UpdateData, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    // Update the user profile and  updated data
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true, //  updated user
      runValidators: true, // Ensure validation runs
      upsert: false, // Prevent creating new user if not found
    }).select("-password -__v"); // Exclude sensitive fields

    if (!updatedUser) {
      throw new Error("User not found");
      // return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Update User Preferences
export const updateUserPreference = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
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

    res
      .status(200)
      .json({ message: "Preferences updated successfully", preferences });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Get Profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { id: viewerId } = req.user as RequestUser;

    // Fetch user profile without the password
    const user = await User.findById(userId).lean().select("-password");
    if (!user) {
      res.status(404).json({ message: "User not found" });
    }

    // Fetch viewer's profile to access location
    const viewer = await User.findById(viewerId).lean().select("location");
    if (!viewer || !user?.location || !viewer.location) {
      throw new Error("Location data missing");
      // res.status(400).json({ message: "Location data missing" });
    }

    // Calculate distance between the viewer and the profile owner
    const distance = calculateDistance(
      viewer.location.coordinates,
      user?.location.coordinates
    );

    // Fetch user's photos
    const photos = await UserPhotos.find({ user: userId }).select("photoUrl");

    // Check if the profile is unlocked by the viewer
    const isUnlocked = await UnlockHistory.exists({
      user: viewerId,
      unlockedUser: userId,
    });

    // Prepare profile data
    let profileData: ProfileData = {
      _id: user._id,
      visibleName: user.visibleName,
      age: user.age,
      gender: user.gender,
      bio: user.bio,
      photos: isUnlocked ? photos : blurPhotos(photos),
      distance,
    };

    // If the user is viewing their own profile, show full data
    if (userId === viewerId) {
      profileData = {
        ...user, // Full user data
        photos, // Full photos
        distance,
      };
    }

    res.status(200).json(profileData);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get Next Profile (Matchmaking)
export const getNextProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.user as RequestUser;
    const user = await User.findById(id);
    if (!user) res.status(404).json({ message: "User not found" });

    // Get user preferences
    const preferences = await UserPreference.findOne({ user: user?._id });
    if (!preferences) {
      throw new Error("Preferences not set");
      // res.status(400).json({ message: "Preferences not set" });
    }

    // Fetch rejected profiles
    const rejectedProfiles = await RejectedProfiles.find({
      user: user?._id,
    }).select("rejectedUser");
    const rejectedUserIds = rejectedProfiles.map((r) => r.rejectedUser);

    // Profile filtering
    const filter = {
      _id: { $ne: user?._id, $nin: rejectedUserIds },
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
          $geometry: {
            type: "Point",
            coordinates: user?.location?.coordinates,
          },
          $maxDistance: preferences.distance * 1000, // Convert km to meters
        },
      },
    } as IFilter;

    if (preferences?.gender !== "Any") {
      filter.gender = preferences?.gender;
    }

    const profiles = await User.find(filter).limit(1);
    if (profiles.length === 0)
      res.status(404).json({ message: "No profiles found" });

    const profile = profiles[0];

    res.status(200).json({
      _id: profile._id,
      visibleName: profile.visibleName,
      age: profile?.age,
      gender: profile.gender,
      distance:
        user?.location?.coordinates && profile?.location?.coordinates
          ? calculateDistance(
              user.location.coordinates,
              profile.location.coordinates
            )
          : 0,
      photo: blurPhotos(
        await UserPhotos.find({ user: profile._id }).select("photoUrl")
      ),
    });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Like Profile (Save to Slot)
export const likeProfile = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    const { profileId } = req.body;

    const user = await User.findById(userId);
    const profile = await User.findById(profileId);
    if (!user || !profile)
      res.status(404).json({ message: "User or profile not found" });

    // Check if profile is already saved in a slot
    const existingSlot = await Slot.findOne({
      user: userId,
      profile: profileId,
    });
    if (existingSlot)
      res.status(400).json({ message: "Profile already saved" });

    // Get user's slots and find a free one
    const slots = await Slot.find({ user: userId });
    const freeSlot = slots.find((slot) => !slot.profile);
    if (!freeSlot) {
      throw new Error("No available slots");
      // res.status(400).json({ message: "No available slots" });
    }

    // Assign profile to the free slot
    freeSlot.profile = profileId;
    await freeSlot.save();

    res.status(200).json({ message: "Profile added to slot", slot: freeSlot });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Reject Profile
export const rejectProfile = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    const { profileId } = req.body;

    const user = await User.findById(userId);
    const profile = await User.findById(profileId);
    if (!user || !profile)
      res.status(404).json({ message: "User or profile not found" });

    await RejectedProfiles.create({ user: userId, rejectedUser: profileId });

    res.status(200).json({ message: "Profile rejected" });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Unlock Profile
export const unlockProfile = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    const { profileId } = req.body;

    const user = await User.findById(userId);
    if (!user) res.status(404).json({ message: "User not found" });

    await UnlockHistory.create({ user: userId, unlockedUser: profileId });

    res.status(200).json({ message: "Profile unlocked" });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Helper function to blur photos
export const blurPhotos = (photos: any) => {
  return photos.map((p: any) => ({ photoUrl: `${p.photoUrl}?blur=10` }));
};

// 1️⃣ Buy Slot (Mock Payment)
export const buySlot = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
      // res.status(404).json({ message: "User not found" });
    }

    // Limit to 10 slots max
    const userSlots = await Slot.countDocuments({ user: userId });
    if (userSlots >= 10) {
      res.status(400).json({ message: "Max slot limit reached (10)" });
    }

    // TODO: Integrate real payment system (Stripe, Razorpay)
    const paymentSuccessful = true; // Simulate payment success

    if (!paymentSuccessful) {
      res.status(402).json({ message: "Payment failed" });
    }

    // Create a new slot
    const newSlot = new Slot({ user: userId, profile: null });
    await newSlot.save();

    // Increase maxSlots count in user model (optional)
    user.maxSlots += 1;
    await user.save();

    res
      .status(200)
      .json({ message: "Slot purchased successfully", slot: newSlot });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// 2️⃣ Get User Slots
export const getUserSlots = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    const slots = await Slot.find({ user: userId }).populate("profile");

    res.status(200).json({ slots });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

export const findMatch = async (socketId: string, userId: string) => {
  try {
    // 1️⃣ **Fetch User & Preferences**
    const user = await User.findById(userId);
    if (!user) return null;

    const preferences = await UserPreference.findOne({ user: userId });
    if (!preferences) return null;

    // 2️⃣ **Fetch Rejected Users**
    const rejectedProfiles = await RejectedProfiles.find({
      user: userId,
    }).select("rejectedUser");
    const rejectedUserIds = rejectedProfiles.map((r) =>
      r?.rejectedUser?.toString()
    );

    let bestMatch: MatchProfile = { socketId: null, profile: null, score: -1 };

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
      if (profile.interests?.hobbies && user?.interests?.hobbies) {
        const sharedInterests = profile.interests.hobbies.filter((i: any) =>
          user?.interests?.hobbies.includes(i)
        ).length;
        score += sharedInterests * weights.interests;
      }

      // 4️⃣ **Sexual Orientation & Goal Matching**
      if (profile.sexualOrientation === user?.sexualOrientation)
        score += weights.sexualOrientation;
      if (profile.goal?.primary === preferences?.goal?.primary)
        score += weights.primaryGoal;

      // 5️⃣ **Gender & Preference Matching**
      if (profile.gender === preferences?.gender) score += weights.genderMatch;
      if (user.gender === profile.preferences?.gender)
        score += weights.genderMatch;

      // 6️⃣ **Age Matching**
      const age = calculateAge(profile.dob);
      if (
        age >= preferences?.ageRange?.min &&
        age <= preferences?.ageRange?.max
      ) {
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
        user: bestMatch.profile?._id,
      }).select("photoUrl");
    }

    return bestMatch.profile ? bestMatch : null;
  } catch (error) {
    console.error("Error in findMatch:", error);
    return null;
  }
};

// Helper function to calculate age
export const calculateAge = (dob: string) => {
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
export const calculateDistance = (
  coords1: [number, number],
  coords2: [number, number]
) => {
  const [lat1, lon1] = coords1;
  const [lat2, lon2] = coords2;
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
