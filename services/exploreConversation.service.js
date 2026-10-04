import { startExploreConversation } from "./exploreConversationCore.service.js";
import { sendNotificationToUser } from "./push.service.js";
import socketService from "./socket.service.js";
import { logError } from "../utils/logError.js";

export const startExploreConversationAndNotify = async ({ userId, profileId }) => {
  const conversation = await startExploreConversation({ userId, profileId });
  socketService.emitToUsers([userId, profileId], "inbox_updated", {
    roomId: conversation.roomId,
  });

  if (conversation.created) {
    void sendNotificationToUser(profileId, {
      title: "New connection",
      body: "Someone wants to connect with you on Lumore.",
      tag: `explore-conversation-${conversation.roomId}`,
      data: {
        type: "explore_conversation",
        roomId: conversation.roomId,
        matchedUserId: userId,
        url: `/app/chat/${conversation.roomId}`,
      },
    }).catch((error) => {
      logError("[explore] conversation push failed", error);
    });
  }

  return conversation;
};
