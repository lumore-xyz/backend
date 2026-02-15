import cron from "node-cron";
import User from "../models/user.model.js";
import { deleteUserAndActivity } from "./accountDeletion.service.js";

/**
 * Initialize all cron jobs
 */
export const initializeCronJobs = () => {
  // Reset daily conversations count every day at midnight
  cron.schedule("0 0 * * *", async () => {
    try {
      // Reset dailyConversations to 10 for all users
      await User.updateMany(
        {},
        {
          $set: {
            dailyConversations: 10,
            lastConversationReset: new Date(),
          },
        }
      );
    } catch (error) {
      console.error("[Cron] Error resetting daily conversations:", error);
    }
  });

  // Delete archived accounts that passed scheduledDeletionAt
  cron.schedule("30 2 * * *", async () => {
    try {
      const now = new Date();
      const usersToDelete = await User.find({
        isArchived: true,
        scheduledDeletionAt: { $lte: now },
      }).select("_id");

      if (!usersToDelete.length) {
        return;
      }

      const userIds = usersToDelete.map((user) => user._id);
      for (const userId of userIds) {
        const result = await deleteUserAndActivity({ userId });
        if (result.success) {
          continue;
        }
        console.error("[Cron] Failed to fully delete user:", {
          userId: userId.toString(),
          reason: result.reason,
        });
      }
    } catch (error) {
      console.error("[Cron] Error deleting archived accounts:", error);
    }
  });

  console.log("[Cron] All cron jobs initialized");
};
