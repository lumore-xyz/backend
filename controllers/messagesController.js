import Message from "../models/Message.js";

export const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ message: "Invalid request: roomId required" });
    }

    // Fetch messages in the room, sorted by creation time (ascending)
    const messages = await Message.find({ roomId })
      .populate("sender", "_id name avatar") // Only necessary fields
      .populate("receiver", "_id name avatar")
      .populate({
        path: "replyTo",
        select: "_id sender encryptedData createdAt", // Don't over-fetch
        populate: {
          path: "sender",
          select: "_id name avatar",
        },
      })
      .sort({ createdAt: 1 }); // Oldest first

    return res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching room messages:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
