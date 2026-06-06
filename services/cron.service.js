import cron from "node-cron";
import User from "../models/user.model.js";
import { deleteUserAndActivity } from "./accountDeletion.service.js";
import { runDueLocationRoomCycles } from "./locationRoomMatching.service.js";
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

  cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await runDueLocationRoomCycles();
      if (result.processed > 0) {
        console.log("[Cron] Location room cycles:", {
          scanned: result.scanned,
          processed: result.processed,
        });
      }
    } catch (error) {
      console.error("[Cron] Error running location room cycles:", error);
    }
  });

  console.log("[Cron] All cron jobs initialized");
};
