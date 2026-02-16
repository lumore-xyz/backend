import cron from "node-cron";
import { deleteUserAndActivity } from "./accountDeletion.service.js";
import { cleanupExpiredImageMessages } from "./messageCleanup.service.js";

/**
 * Initialize all cron jobs
 */
export const initializeCronJobs = () => {
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

  // Clean up image messages before TTL deletion so cloud files are not orphaned.
  cron.schedule("*/10 * * * *", async () => {
    try {
      const result = await cleanupExpiredImageMessages();
      if (result.scanned > 0) {
        console.log("[Cron] Message image cleanup:", result);
      }
    } catch (error) {
      console.error("[Cron] Error cleaning up expired image messages:", error);
    }
  });

  console.log("[Cron] All cron jobs initialized");
};
