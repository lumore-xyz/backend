import express from "express";
import {
  getAdminStats,
  getAdminUsers,
  getCreditLedgerAdmin,
  getPendingThisOrThatQuestions,
  getReportedUsersAdmin,
  updateReportedUserStatusAdmin,
  updateUserArchiveStatus,
} from "../controllers/admin.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/stats", getAdminStats);
router.get("/users", getAdminUsers);
router.patch("/users/:userId/archive", validateObjectIdParam("userId"), updateUserArchiveStatus);
router.get("/games/this-or-that/pending", getPendingThisOrThatQuestions);
router.get("/credits/ledger", getCreditLedgerAdmin);
router.get("/reported-users", getReportedUsersAdmin);
router.patch(
  "/reported-users/:reportId/status",
  validateObjectIdParam("reportId"),
  updateReportedUserStatusAdmin,
);

export default router;
