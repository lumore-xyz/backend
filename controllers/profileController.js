// /controllers/profileController.js
import User from "../models/User.js";

// Create or Update Profile
export const createProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    Object.assign(user, req.body);
    await user.save();

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Profile
export const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user.id;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isUnlocked = user.unlockedBy.includes(viewerId);
    res.status(200).json({
      _id: user._id,
      visibleName: user.visibleName,
      age: user.age,
      gender: user.gender,
      photo: isUnlocked ? user.photos[0] : blurPhoto(user.photos[0]),
      bio: isUnlocked ? user.bio : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Next Profile (Matchmaking)
export const getNextProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const filter = {
      _id: { $ne: user._id, $nin: user.rejectedProfiles },
      dob: {
        $gte: new Date(
          new Date().setFullYear(
            new Date().getFullYear() - user.preferences.ageRange.max
          )
        ),
        $lte: new Date(
          new Date().setFullYear(
            new Date().getFullYear() - user.preferences.ageRange.min
          )
        ),
      },
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: user.location.coordinates },
          $maxDistance: user.preferences.distance * 1000, // Convert km to meters
        },
      },
    };

    if (user.preferences.gender !== "Any") {
      filter.gender = user.preferences.gender;
    }

    const profiles = await User.find(filter).limit(1);

    if (profiles.length === 0) {
      return res.status(404).json({ message: "No profiles found" });
    }

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
      photo: blurPhoto(profile.photos[0]),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Like Profile (Save to Slot)
export const likeProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const profile = await User.findById(req.body.profileId);

    if (!user || !profile) {
      return res.status(404).json({ message: "User or profile not found" });
    }

    if (user.slots.length >= user.maxSlots) {
      return res.status(400).json({ message: "No slots available" });
    }

    if (user.slots.some((slot) => slot.userId.equals(profile._id))) {
      return res.status(400).json({ message: "Profile already in slots" });
    }

    user.slots.push({ userId: profile._id });
    await user.save();

    res.status(200).json({ message: "Profile added to slots" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject Profile
export const rejectProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const profile = await User.findById(req.body.profileId);

    if (!user || !profile) {
      return res.status(404).json({ message: "User or profile not found" });
    }

    if (!user.rejectedProfiles.includes(profile._id)) {
      user.rejectedProfiles.push(profile._id);
    }

    user.slots = user.slots.filter((slot) => !slot.userId.equals(profile._id));
    profile.slots = profile.slots.filter(
      (slot) => !slot.userId.equals(user._id)
    );

    await user.save();
    await profile.save();

    res.status(200).json({ message: "Profile rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unlock Profile
export const unlockProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.unlockedBy.includes(req.body.profileId)) {
      user.unlockedBy.push(req.body.profileId);
      await user.save();
    }

    res.status(200).json({ message: "Profile unlocked" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Buy Slot (Mock Payment)
export const buySlot = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.maxSlots >= 10) {
      // Set a reasonable max limit
      return res.status(400).json({ message: "Slot limit reached" });
    }

    // TODO: Add actual payment verification (Stripe, Razorpay)
    user.maxSlots += 1;
    await user.save();

    res.status(200).json({ message: "Slot purchased successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const blurPhoto = (photoUrl) => `${photoUrl}?blur=10`;

export const findMatch = (socketId, userProfile) => {
  let bestMatch = null;
  let bestScore = -1;

  waitingPool.forEach((profile, otherSocketId) => {
    if (socketId !== otherSocketId) {
      let score = 0;

      // **1. Match on Interests**
      const sharedInterests = profile.interests.hobbies.filter((i) =>
        userProfile.interests.hobbies.includes(i)
      ).length;
      score += sharedInterests * 3; // Interests have high weight

      // **2. Match on Sexual Orientation & Goals**
      if (profile.sexualOrientation === userProfile.sexualOrientation)
        score += 2;
      if (profile.goal.primary === userProfile.goal.primary) score += 2;

      // **3. Gender & Preference Matching**
      if (profile.gender === userProfile.preferences.gender) score += 2;
      if (userProfile.gender === profile.preferences.gender) score += 2;

      // **4. Age Range Matching**
      const age = calculateAge(profile.dob);
      if (
        age >= userProfile.preferences.ageRange.min &&
        age <= userProfile.preferences.ageRange.max
      ) {
        score += 2;
      }

      // **5. Distance Matching**
      const distance = calculateDistance(
        profile.location.coordinates,
        userProfile.location.coordinates
      );
      if (distance <= userProfile.preferences.distance) {
        score += 2;
      }

      // **Select the best match**
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { socketId: otherSocketId, profile };
      }
    }
  });

  return bestMatch;
};

// Helper function to calculate age
export const calculateAge = (dob) => {
  const birthDate = new Date(dob);
  const today = new Date();
  return today.getFullYear() - birthDate.getFullYear();
};

// Helper function to calculate distance between two coordinates
export const calculateDistance = (coords1, coords2) => {
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
