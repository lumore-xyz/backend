import Push from "../models/PushSubscription.js";
import User from "../models/User.js";
import { sendNotificationToUser } from "../services/pushService.js";

// Subscribe to push notifications
export const subscribe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log("[subscribe] userId", userId);
    const { subscription } = req.body; // Changed from req.params to req.body
    console.log("[subscribe] subscription", subscription);

    // Validate subscription object
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return next(new Error("Invalid subscription object", 400));
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new Error("User not found", 404));
    }

    // Check if subscription already exists for this endpoint
    const existingSubscription = await Push.findOne({
      "subscription.endpoint": subscription.endpoint,
    });

    if (existingSubscription) {
      // Update the user reference if needed
      if (existingSubscription.user.toString() !== userId) {
        existingSubscription.user = userId;
        await existingSubscription.save();
      }

      return res.status(200).json({
        status: "success",
        message: "Subscription already exists",
        data: { subscription: existingSubscription },
      });
    }

    // Create new push subscription
    const newSubscription = await Push.create({
      user: userId,
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
    });

    res.status(201).json({
      status: "success",
      message: "Successfully subscribed to push notifications",
      data: { subscription: newSubscription },
    });
  } catch (error) {
    next(error);
  }
};

// Unsubscribe from push notifications
export const unsubscribe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { endpoint } = req.body; // The subscription endpoint to remove

    // Validate endpoint
    if (!endpoint) {
      return next(new Error("Endpoint is required", 400));
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new Error("User not found", 404));
    }

    // Find and delete the subscription
    const deletedSubscription = await Push.findOneAndDelete({
      user: userId,
      "subscription.endpoint": endpoint,
    });

    if (!deletedSubscription) {
      return res.status(404).json({
        status: "fail",
        message: "Subscription not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Successfully unsubscribed from push notifications",
    });
  } catch (error) {
    next(error);
  }
};

export const sendNotification = async (req, res, next) => {
  try {
    const { userId, title, body, icon, image, data, tag } = req.body;

    if (!userId || !title || !body) {
      return next(new Error("userId, title, and body are required", 400));
    }

    const result = await sendNotificationToUser(userId, {
      title,
      body,
      icon,
      image,
      data,
      tag,
    });

    res.status(200).json({
      status: "success",
      message: "Notification sent",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
