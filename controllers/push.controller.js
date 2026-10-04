import { sendNotificationToUser } from "../services/push.service.js";
import {
  subscribeUserToPush,
  unsubscribeUserFromPush,
} from "../services/pushSubscription.service.js";

// Subscribe to push notifications
export const subscribe = async (req, res) => {
  const userId = req.user.id;
  const { subscription } = req.body || {};

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ status: "fail", message: "Invalid subscription object" });
  }

  const result = await subscribeUserToPush(userId, subscription);
  if (result.error === "USER_NOT_FOUND") {
    return res.status(404).json({ status: "fail", message: "User not found" });
  }

  return res.status(result.existing ? 200 : 201).json({
    status: "success",
    message: result.existing
      ? "Subscription already exists"
      : "Successfully subscribed to push notifications",
    data: { subscription: result.subscription },
  });
};

// Unsubscribe from push notifications
export const unsubscribe = async (req, res) => {
  const userId = req.user.id;
  const { endpoint } = req.body || {};

  if (!endpoint) {
    return res.status(400).json({ status: "fail", message: "Endpoint is required" });
  }

  const deletedSubscription = await unsubscribeUserFromPush(userId, endpoint);
  if (deletedSubscription?.error === "USER_NOT_FOUND") {
    return res.status(404).json({ status: "fail", message: "User not found" });
  }

  if (!deletedSubscription) {
    return res.status(404).json({ status: "fail", message: "Subscription not found" });
  }

  return res.status(200).json({
    status: "success",
    message: "Successfully unsubscribed from push notifications",
  });
};

export const sendNotification = async (req, res) => {
  const { userId, title, body, icon, image, data, tag } = req.body || {};

  if (!userId || !title || !body) {
    return res.status(400).json({
      status: "fail",
      message: "userId, title, and body are required",
    });
  }

  const result = await sendNotificationToUser(userId, {
    title,
    body,
    icon,
    image,
    data,
    tag,
  });

  return res.status(200).json({
    status: "success",
    message: "Notification sent",
    data: result,
  });
};
