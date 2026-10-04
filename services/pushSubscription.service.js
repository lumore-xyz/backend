import Push from "../models/push.model.js";
import User from "../models/user.model.js";
import { idsEqual } from "../utils/objectId.js";

export const subscribeUserToPush = async (userId, subscription) => {
  if (!(await User.exists({ _id: userId }))) return { error: "USER_NOT_FOUND" };

  const existing = await Push.findOne({
    "subscription.endpoint": subscription.endpoint,
  });
  if (existing) {
    if (!idsEqual(existing.user, userId)) {
      existing.user = userId;
      await existing.save();
    }
    return { subscription: existing, existing: true };
  }

  const created = await Push.create({
    user: userId,
    subscription: {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    },
  });
  return { subscription: created, existing: false };
};

export const unsubscribeUserFromPush = async (userId, endpoint) => {
  if (!(await User.exists({ _id: userId }))) return { error: "USER_NOT_FOUND" };
  return Push.findOneAndDelete({ user: userId, "subscription.endpoint": endpoint });
};
