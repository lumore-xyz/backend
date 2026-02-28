// services/pushNotificationService.js
import * as OneSignal from "@onesignal/node-onesignal";
import webpush from "web-push";
import Push from "../models/push.model.js";

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUSH_PUBLIC_KEY,
  process.env.VAPID_PUSH_PRIVATE_KEY
);

const ONESIGNAL_APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_API_KEY = String(process.env.ONESIGNAL_API_KEY || "").trim();

const oneSignalClient =
  ONESIGNAL_APP_ID && ONESIGNAL_API_KEY
    ? new OneSignal.DefaultApi(
        OneSignal.createConfiguration({
          restApiKey: ONESIGNAL_API_KEY,
        })
      )
    : null;

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

const normalizeOneSignalError = (error) => {
  if (error?.body) return error.body;
  if (error?.response?.body) return error.response.body;
  if (error?.response?.text) return error.response.text;
  return error?.message || error;
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
    const normalizedError = normalizeOneSignalError(error);
    console.error(
      "OneSignal notification failed for user:",
      String(userId),
      normalizedError
    );
    return {
      success: false,
      error: normalizedError,
    };
  }
};

const sendViaOneSignalToAll = async (payload) => {
  if (!oneSignalClient || !ONESIGNAL_APP_ID) {
    return {
      success: false,
      skipped: true,
      message: "OneSignal not configured",
    };
  }

  try {
    const notification = buildOneSignalNotification(payload);
    notification.included_segments = ["Subscribed Users"];
    notification.target_channel = "push";

    const response = await oneSignalClient.createNotification(notification);

    return {
      success: true,
      id: response?.id,
      recipients: response?.recipients ?? 0,
    };
  } catch (error) {
    const normalizedError = normalizeOneSignalError(error);
    console.error("OneSignal broadcast notification failed:", normalizedError);
    return {
      success: false,
      error: normalizedError,
    };
  }
};

const sendViaVapidToUser = async (userId, payload) => {
  // Get all subscriptions for the user
  const subscriptions = await Push.find({ user: userId });

  if (subscriptions.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      results: [],
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
      return { success: true, endpoint: sub.subscription.endpoint };
    } catch (error) {
      console.error("Failed to send to:", sub.subscription.endpoint, error);

      // Remove invalid subscriptions (410 Gone or 404 Not Found)
      if (error.statusCode === 410 || error.statusCode === 404) {
        await Push.findByIdAndDelete(sub._id);
      }

      return { success: false, endpoint: sub.subscription.endpoint, error };
    }
  });

  const results = await Promise.all(sendPromises);
  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    success: sent > 0,
    sent,
    failed,
    results,
  };
};

const sendViaVapidToAll = async (payload) => {
  const subscriptions = await Push.find({});

  if (subscriptions.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      message: "No subscriptions found",
    };
  }

  const notificationPayload = buildWebPushPayload(payload, {
    icon: "/icon.png",
    badge: "/badge.png",
  });

  const sendPromises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, notificationPayload);
      return { success: true };
    } catch (error) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        await Push.findByIdAndDelete(sub._id);
      }
      return { success: false, error };
    }
  });

  const results = await Promise.all(sendPromises);
  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    success: sent > 0,
    sent,
    failed,
  };
};

/**
 * Send notification to a specific user
 */
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
      results: vapid.results,
      vapid,
      onesignal,
    };
  } catch (error) {
    console.error("Error sending notification:", error);
    throw error;
  }
};

/**
 * Send notification to multiple users
 */
export const sendNotificationToMultipleUsers = async (userIds, payload) => {
  const results = await Promise.all(
    userIds.map((userId) => sendNotificationToUser(userId, payload))
  );

  return results;
};

/**
 * Send notification to all users
 */
export const sendNotificationToAll = async (payload) => {
  try {
    const [vapid, onesignal] = await Promise.all([
      sendViaVapidToAll(payload),
      sendViaOneSignalToAll(payload),
    ]);

    return {
      success: vapid.success || onesignal.success,
      sent: vapid.sent,
      failed: vapid.failed,
      vapid,
      onesignal,
    };
  } catch (error) {
    console.error("Error sending broadcast notification:", error);
    throw error;
  }
};
