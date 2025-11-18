// services/pushNotificationService.js
import webpush from "web-push";
import Push from "../models/PushSubscription.js";

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUSH_PUBLIC_KEY,
  process.env.VAPID_PUSH_PRIVATE_KEY
);

/**
 * Send notification to a specific user
 */
export const sendNotificationToUser = async (userId, payload) => {
  try {
    // Get all subscriptions for the user
    const subscriptions = await Push.find({ user: userId });

    if (subscriptions.length === 0) {
      console.log("No subscriptions found for user:", userId);
      return { success: false, message: "No subscriptions found" };
    }

    // Prepare notification payload
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icons/icon-192x192.png",
      badge: payload.badge || "/badge.png",
      image: payload.image,
      data: payload.data || {},
      tag: payload.tag,
      requireInteraction: payload.requireInteraction || false,
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
          console.log("Removed invalid subscription");
        }

        return { success: false, endpoint: sub.subscription.endpoint, error };
      }
    });

    const results = await Promise.all(sendPromises);

    return {
      success: true,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
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
    const subscriptions = await Push.find({});

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/icon.png",
      badge: payload.badge || "/badge.png",
      image: payload.image,
      data: payload.data || {},
      tag: payload.tag,
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

    return {
      success: true,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  } catch (error) {
    console.error("Error sending broadcast notification:", error);
    throw error;
  }
};
