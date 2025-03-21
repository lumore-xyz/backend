import Slot from "../models/Slot.js";
import User from "../models/User.js";

class SlotService {
  // Create a new slot for a match
  async createSlot(userId, matchId) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Check if user has reached their slot limit
    const currentSlots = await Slot.countDocuments({
      user: userId,
      isActive: true,
    });
    if (currentSlots >= user.maxSlots) {
      throw new Error("Slot limit reached. Upgrade to premium for more slots.");
    }

    // Check if slot already exists
    const existingSlot = await Slot.findOne({ user: userId, match: matchId });
    if (existingSlot) {
      throw new Error("Slot already exists for this match");
    }

    // Create new slot
    const slot = await Slot.create({
      user: userId,
      match: matchId,
      metadata: {
        matchDate: new Date(),
      },
    });

    return slot;
  }

  // Get all active slots for a user
  async getUserSlots(userId) {
    return await Slot.find({ user: userId, isActive: true })
      .populate("match", "username profilePicture")
      .sort({ lastInteraction: -1 });
  }

  // Add message to slot chat history
  async addMessageToSlot(slotId, senderId, content) {
    const slot = await Slot.findById(slotId);
    if (!slot) throw new Error("Slot not found");

    const message = {
      sender: senderId,
      content,
      timestamp: new Date(),
    };

    slot.chatHistory.push(message);
    slot.lastInteraction = new Date();
    slot.metadata.lastMessage = content;
    slot.metadata.unreadCount += 1;

    await slot.save();
    return message;
  }

  // Mark slot messages as read
  async markSlotAsRead(slotId) {
    const slot = await Slot.findById(slotId);
    if (!slot) throw new Error("Slot not found");

    slot.metadata.unreadCount = 0;
    await slot.save();
  }

  // Update slot notes
  async updateSlotNotes(slotId, notes) {
    const slot = await Slot.findById(slotId);
    if (!slot) throw new Error("Slot not found");

    slot.notes = notes;
    await slot.save();
    return slot;
  }

  // Add tags to slot
  async addSlotTags(slotId, tags) {
    const slot = await Slot.findById(slotId);
    if (!slot) throw new Error("Slot not found");

    slot.tags = [...new Set([...slot.tags, ...tags])];
    await slot.save();
    return slot;
  }

  // Deactivate a slot
  async deactivateSlot(slotId) {
    const slot = await Slot.findById(slotId);
    if (!slot) throw new Error("Slot not found");

    slot.isActive = false;
    await slot.save();
    return slot;
  }

  // Get slot by ID
  async getSlotById(slotId) {
    return await Slot.findById(slotId)
      .populate("match", "username profilePicture")
      .populate("chatHistory.sender", "username profilePicture");
  }
}

export default new SlotService();
