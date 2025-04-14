import Slot from "../models/Slot.js";
import User from "../models/User.js";

// Create a new slot
export const createSlot = async (req, res, next) => {
  const userId = req.user.id;

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    return next(new Error("User not found", 404));
  }

  // Check if user has reached max slots
  const currentSlots = await Slot.countDocuments({ user: userId });
  if (currentSlots >= user.maxSlots) {
    return next(new Error("Maximum number of slots reached", 400));
  }

  const slot = await Slot.create({ user: userId });

  res.status(201).json({
    status: "success",
    data: {
      slot,
    },
  });
};

// Update a slot
export const updateSlot = async (req, res, next) => {
  const { slotId } = req.params;
  const { profile, roomId } = req.body;
  const userId = req.user.id;

  const slot = await Slot.findOne({ _id: slotId, user: userId });

  if (!slot) {
    return next(new Error("Slot not found or unauthorized", 404));
  }

  // If updating profile, verify the profile exists
  if (profile) {
    const profileUser = await User.findById(profile);
    if (!profileUser) {
      return next(new Error("Profile user not found", 404));
    }
  }

  // Update slot
  slot.profile = profile || slot.profile;
  slot.roomId = roomId || slot.roomId;
  await slot.save();

  res.status(200).json({
    status: "success",
    data: {
      slot,
    },
  });
};

// Get all slots for a user
export const getSlots = async (req, res, next) => {
  const userId = req.user.id;

  const slots = await Slot.find({ user: userId })
    .populate("profile", "username nickname profilePicture")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: slots.length,
    data: {
      slots,
    },
  });
};

// Get a single slot
export const getSlot = async (req, res, next) => {
  const { slotId } = req.params;
  const userId = req.user.id;

  const slot = await Slot.findOne({ _id: slotId, user: userId }).populate(
    "profile",
    "username nickname profilePicture"
  );

  if (!slot) {
    return next(new Error("Slot not found or unauthorized", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      slot,
    },
  });
};
