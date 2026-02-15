import CreditLedger from "../models/creditLedger.model.js";
import Message from "../models/message.model.js";
import UserPreference from "../models/preference.model.js";
import { Post } from "../models/post.model.js";
import Push from "../models/push.model.js";
import RejectedProfile from "../models/reject.model.js";
import Report from "../models/report.model.js";
import MatchRoom from "../models/room.model.js";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import UnlockHistory from "../models/unlock.model.js";
import User from "../models/user.model.js";
import UserPhotos from "../models/UserPhotos.js";

const getTransferAdminId = async (excludeUserId) => {
  const admin = await User.findOne({
    isAdmin: true,
    _id: { $ne: excludeUserId },
  })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();

  return admin?._id || null;
};

const transferThisOrThatData = async ({ fromUserId, toAdminId }) => {
  await ThisOrThatQuestion.updateMany(
    { submittedBy: fromUserId },
    { $set: { submittedBy: toAdminId } }
  );
};

export const deleteUserAndActivity = async ({ userId }) => {
  const user = await User.findById(userId).select("_id").lean();
  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  const transferAdminId = await getTransferAdminId(userId);
  if (!transferAdminId) {
    return { success: false, reason: "NO_ADMIN_FOR_TRANSFER" };
  }

  await transferThisOrThatData({
    fromUserId: userId,
    toAdminId: transferAdminId,
  });

  const rooms = await MatchRoom.find({ participants: userId }).select("_id").lean();
  const roomIds = rooms.map((room) => room._id);
  const roomIdStrings = roomIds.map((id) => id.toString());

  await Promise.all([
    Message.deleteMany({
      $or: [
        { sender: userId },
        { receiver: userId },
        { roomId: { $in: roomIdStrings } },
      ],
    }),
    MatchRoom.deleteMany({ _id: { $in: roomIds } }),
    Post.deleteMany({ userId }),
    ThisOrThatAnswer.deleteMany({ userId }),
    UserPhotos.deleteMany({ user: userId }),
    UserPreference.deleteMany({ user: userId }),
    UnlockHistory.deleteMany({
      $or: [{ user: userId }, { unlockedUser: userId }],
    }),
    RejectedProfile.deleteMany({
      $or: [
        { user: userId },
        { rejectedUser: userId },
        { roomId: { $in: roomIds } },
      ],
    }),
    Report.deleteMany({
      $or: [
        { reporter: userId },
        { reportedUser: userId },
        { roomId: { $in: roomIds } },
      ],
    }),
    Push.deleteMany({ user: userId }),
    CreditLedger.deleteMany({ user: userId }),
    User.deleteOne({ _id: userId }),
  ]);

  return {
    success: true,
    transferAdminId: transferAdminId.toString(),
  };
};
