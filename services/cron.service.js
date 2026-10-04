import cron from "node-cron";
import { deleteScheduledAccounts } from "./accountDeletion.service.js";
import { cleanupExpiredArchivedChats } from "./chatCleanup.service.js";
import { runDueLocationRoomCycles } from "./locationRoomScheduler.service.js";
import { cleanupExpiredMediaMessages } from "./messageCleanup.service.js";
import { logError } from "../utils/logError.js";

const scheduleTask = (expression, errorMessage, task, reportResult) => {
  let running = false;
  return cron.schedule(expression, async () => {
    if (running) return;
    running = true;
    try {
      reportResult(await task());
    } catch (error) {
      logError(errorMessage, error);
    } finally {
      running = false;
    }
  });
};

/**
 * Initialize all cron jobs
 */
export const initializeCronJobs = () => {
  scheduleTask(
    "30 2 * * *",
    "[Cron] Error deleting archived accounts:",
    deleteScheduledAccounts,
    (results) => {
      const failures = results.filter(({ success }) => !success).length;
      if (failures) {
        console.error("[Cron] Failed to fully delete archived accounts", {
          failures,
        });
      }
    },
  );

  scheduleTask(
    "*/10 * * * *",
    "[Cron] Error cleaning up expired message media:",
    cleanupExpiredMediaMessages,
    (result) => {
      if (result.scanned > 0) {
        console.log("[Cron] Message media cleanup:", result);
      }
    },
  );

  scheduleTask(
    "0 3 * * *",
    "[Cron] Error cleaning up archived chats:",
    cleanupExpiredArchivedChats,
    (result) => {
      if (result.scanned > 0) {
        console.log("[Cron] Archived chat cleanup:", result);
      }
    },
  );

  scheduleTask(
    "* * * * *",
    "[Cron] Error running location room cycles:",
    runDueLocationRoomCycles,
    (result) => {
      if (result.processed > 0) {
        console.log("[Cron] Location room cycles:", {
          scanned: result.scanned,
          processed: result.processed,
        });
      }
    },
  );

  console.log("[Cron] All cron jobs initialized");
};
