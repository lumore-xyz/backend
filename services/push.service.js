import * as OneSignal from "@onesignal/node-onesignal";
import webpush from "web-push";
import Push from "../models/push.model.js";
import { ONESIGNAL_APP_ID, oneSignalClient } from "../config/oneSignal.js";
import { logError } from "../utils/logError.js";

const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || "").trim();
const VAPID_PUSH_PUBLIC_KEY = String(
  process.env.VAPID_PUSH_PUBLIC_KEY || "",
).trim();
const VAPID_PUSH_PRIVATE_KEY = String(
  process.env.VAPID_PUSH_PRIVATE_KEY || "",
).trim();
const WEB_PUSH_CONFIGURED = Boolean(
  VAPID_SUBJECT && VAPID_PUSH_PUBLIC_KEY && VAPID_PUSH_PRIVATE_KEY,
);

if (WEB_PUSH_CONFIGURED) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUSH_PUBLIC_KEY,
    VAPID_PUSH_PRIVATE_KEY,
  );
}

const buildWebPushPayload = (payload, defaults = {}) =>
  JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || defaults.icon,
    badge: payload.badge || defaults.badge,
    image: payload.image,
    data: payload.data || {},
    tag: payload.tag,
    requireInteraction:
      payload.requireInteraction ?? defaults.requireInteraction ?? false,
  });

const buildOneSignalNotification = (payload) => {
  const notification = new OneSignal.Notification();
  notification.app_id = ONESIGNAL_APP_ID;
  notification.contents = { en: payload.body };
  notification.headings = { en: payload.title };
  notification.data = payload.data || {};

  if (payload.image) {
    notification.big_picture = payload.image;
    notification.chrome_web_image = payload.image;
  }

  if (payload.icon) {
    notification.chrome_web_icon = payload.icon;
  }

  if (payload.badge) {
    notification.chrome_web_badge = payload.badge;
  }

  if (payload.tag) {
    notification.web_push_topic = payload.tag;
  }

  if (payload.url) {
    notification.web_url = payload.url;
  }

  return notification;
};

const sendViaOneSignalToUser = async (userId, payload) => {
  if (!oneSignalClient || !ONESIGNAL_APP_ID) {
    return {
      success: false,
      skipped: true,
      message: "OneSignal not configured",
    };
  }

  try {
    const notification = buildOneSignalNotification(payload);
    notification.include_aliases = { external_id: [String(userId)] };
    notification.target_channel = "push";

    const response = await oneSignalClient.createNotification(notification);

    return {
      success: true,
      id: response?.id,
      recipients: response?.recipients ?? 0,
    };
  } catch (error) {
    logError("OneSignal notification failed", error);
    return { success: false };
  }
};

const sendViaVapidToUser = async (userId, payload) => {
  if (!WEB_PUSH_CONFIGURED) {
    return {
      success: false,
      skipped: true,
      sent: 0,
      failed: 0,
      message: "Web push not configured",
    };
  }

  // Get all subscriptions for the user
  const subscriptions = await Push.find({ user: userId })
    .select("_id subscription")
    .lean();

  if (subscriptions.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      message: "No subscriptions found",
    };
  }

  // Prepare notification payload
  const notificationPayload = buildWebPushPayload(payload, {
    icon: "/icons/icon-192x192.png",
    badge: "/badge.png",
    requireInteraction: false,
  });

  // Send to all user's subscriptions
  const sendPromises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, notificationPayload);
      return true;
    } catch (error) {
      logError("Web push notification failed", error);

      // Remove invalid subscriptions (410 Gone or 404 Not Found)
      if (error.statusCode === 410 || error.statusCode === 404) {
        await Push.findByIdAndDelete(sub._id);
      }

      return false;
    }
  });

  const results = await Promise.all(sendPromises);
  const sent = results.filter(Boolean).length;
  const failed = results.length - sent;

  return {
    success: sent > 0,
    sent,
    failed,
  };
};

export const sendNotificationToUser = async (userId, payload) => {
  try {
    const [vapid, onesignal] = await Promise.all([
      sendViaVapidToUser(userId, payload),
      sendViaOneSignalToUser(userId, payload),
    ]);

    return {
      success: vapid.success || onesignal.success,
      sent: vapid.sent,
      failed: vapid.failed,
      vapid,
      onesignal,
    };
  } catch (error) {
    logError("Error sending notification", error);
    throw error;
  }
};
