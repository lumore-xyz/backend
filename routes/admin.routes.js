import express from "express";
import {
  getAdminUsers,
  updateUserArchiveStatus,
} from "../controllers/adminUser.controller.js";
import { getPendingThisOrThatQuestions } from "../controllers/adminThisOrThat.controller.js";
import { getAdminStats } from "../controllers/adminStats.controller.js";
import {
  getCreditLedgerAdmin,
  getCreditLedgerAnalyticsAdmin,
} from "../controllers/adminCredit.controller.js";
import {
  getReportedUsersAdmin,
  updateReportedUserStatusAdmin,
} from "../controllers/adminReport.controller.js";
import {
  createAdminAppVersionController,
  deleteAdminAppVersionController,
  listAdminAppVersionsController,
  updateAdminAppVersionController,
} from "../controllers/mobileAppVersion.controller.js";
import {
  getAdminMobileConfig,
  patchAdminMobileConfig,
} from "../controllers/mobileRuntimeConfig.controller.js";
import { getAdminOptions, patchAdminOptions } from "../controllers/options.controller.js";
import {
  getAdminCampaignConfig,
  sendAdminCampaign,
} from "../controllers/adminCampaign.controller.js";
import {
  createAdminUserGroup,
  getAdminUserGroups,
  updateAdminUserGroupMembers,
} from "../controllers/userGroup.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";
import adminNotificationRoutes from "./adminNotification.routes.js";

const router = express.Router();

router.use(protect, requireAdmin);
router.param("userId", validateObjectIdParam("userId"));
router.param("groupId", validateObjectIdParam("groupId"));
router.param("reportId", validateObjectIdParam("reportId"));
router.param("id", validateObjectIdParam("id"));
router.use("/notifications", adminNotificationRoutes);

router.get("/stats", getAdminStats);
router.get("/users", getAdminUsers);
router.patch("/users/:userId/archive", updateUserArchiveStatus);
router.get("/games/this-or-that/pending", getPendingThisOrThatQuestions);
router.get("/credits/analytics", getCreditLedgerAnalyticsAdmin);
router.get("/credits/ledger", getCreditLedgerAdmin);
router.get("/reported-users", getReportedUsersAdmin);
router.get("/options", getAdminOptions);
router.patch("/options", patchAdminOptions);
router.get("/mobile-config", getAdminMobileConfig);
router.patch("/mobile-config", patchAdminMobileConfig);
router.get("/user-groups", getAdminUserGroups);
router.post("/user-groups", createAdminUserGroup);
router.patch(
  "/user-groups/:groupId/members",
  updateAdminUserGroupMembers,
);
router.get("/notifications/config", getAdminCampaignConfig);
router.post("/notifications/send", sendAdminCampaign);
router.patch(
  "/reported-users/:reportId/status",
  updateReportedUserStatusAdmin,
);

router.get("/app-version", listAdminAppVersionsController);
router.post("/app-version", createAdminAppVersionController);
router.put(
  "/app-version/:id",
  updateAdminAppVersionController,
);
router.delete(
  "/app-version/:id",
  deleteAdminAppVersionController,
);

export default router;
