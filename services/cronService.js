import cron from "node-cron";
import User from "../models/User.js";

/**
 * Initialize all cron jobs
 */
export const initializeCronJobs = () => {
  // Reset daily conversations count every day at midnight
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("[Cron] Starting daily conversations reset...");

      // Reset dailyConversations to 10 for all users
      const result = await User.updateMany(
        {},
        {
          $set: {
            dailyConversations: 10,
            lastConversationReset: new Date(),
          },
        }
      );

      console.log(
        `[Cron] Reset daily conversations for ${result.modifiedCount} users`
      );
    } catch (error) {
      console.error("[Cron] Error resetting daily conversations:", error);
    }
  });

  console.log("[Cron] All cron jobs initialized");
};
