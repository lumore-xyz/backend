import { registerChatRoomHandlers } from "./socketChatRoom.service.js";
import { registerMessageHandlers } from "./socketMessage.service.js";
import { registerMessageEditHandlers } from "./socketMessageEdit.service.js";
import { registerMessageReactionHandlers } from "./socketMessageReaction.service.js";

export const registerChatHandlers = (socket, context) => {
  registerChatRoomHandlers(socket, context);
  registerMessageHandlers(socket, context);
  registerMessageEditHandlers(socket, context);
  registerMessageReactionHandlers(socket, context);
};
