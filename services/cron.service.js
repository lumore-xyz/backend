import cron from "node-cron";
import RejectedProfile from "../models/reject.model.js";
import UnlockHistory from "../models/unlock.model.js";
import UserPreference from "../models/preference.model.js";
import UserPhotos from "../models/UserPhotos.js";
import User from "../models/user.model.js";

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

  // Delete archived accounts that passed scheduledDeletionAt
  cron.schedule("30 2 * * *", async () => {
    try {
      console.log("[Cron] Starting archived account cleanup...");
      const now = new Date();
      const usersToDelete = await User.find({
        isArchived: true,
        scheduledDeletionAt: { $lte: now },
      }).select("_id");

      if (!usersToDelete.length) {
        console.log("[Cron] No archived accounts due for deletion.");
        return;
      }

      const userIds = usersToDelete.map((user) => user._id);

      await Promise.all([
        User.deleteMany({ _id: { $in: userIds } }),
        UnlockHistory.deleteMany({ user: { $in: userIds } }),
        UserPhotos.deleteMany({ user: { $in: userIds } }),
        UserPreference.deleteMany({ user: { $in: userIds } }),
        RejectedProfile.deleteMany({ user: { $in: userIds } }),
      ]);

      console.log(
        `[Cron] Deleted ${userIds.length} archived accounts and related data`
      );
    } catch (error) {
      console.error("[Cron] Error deleting archived accounts:", error);
    }
  });

  console.log("[Cron] All cron jobs initialized");
};
