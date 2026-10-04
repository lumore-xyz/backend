import Message from "../models/message.model.js";

export const markRoomMessagesReadAndDelivered = async ({
  roomId,
  userId,
  emit,
}) => {
  const now = new Date();
  const deliveredFilter = { roomId, receiver: userId, deliveredAt: null };
  const readFilter = { roomId, receiver: userId, readAt: null };
  const [deliveredMessages, readMessages] = await Promise.all([
    Message.find(deliveredFilter).select("_id").lean(),
    Message.find(readFilter).select("_id").lean(),
  ]);

  if (deliveredMessages.length) {
    await Message.updateMany(deliveredFilter, { $set: { deliveredAt: now } });
    emit("message_delivered", {
      roomId,
      messageIds: deliveredMessages.map((message) => message._id.toString()),
      deliveredAt: now.toISOString(),
    });
  }
  if (readMessages.length) {
    await Message.updateMany(readFilter, {
      $set: { readAt: now, deliveredAt: now },
    });
    emit("message_read", {
      roomId,
      messageIds: readMessages.map((message) => message._id.toString()),
      readAt: now.toISOString(),
    });
  }
};
