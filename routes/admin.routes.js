import express from "express";
import {
  getAdminStats,
  getAdminUsers,
  getCreditLedgerAnalyticsAdmin,
  getCreditLedgerAdmin,
  getPendingThisOrThatQuestions,
  getReportedUsersAdmin,
  updateReportedUserStatusAdmin,
  updateUserArchiveStatus,
} from "../controllers/admin.controller.js";
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
  createAdminUserGroup,
  getAdminCampaignConfig,
  getAdminUserGroups,
  sendAdminCampaign,
  updateAdminUserGroupMembers,
} from "../controllers/engagement.controller.js";
import { getOptionIconCatalog } from "../controllers/options.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/stats", getAdminStats);
router.get("/users", getAdminUsers);
router.patch("/users/:userId/archive", validateObjectIdParam("userId"), updateUserArchiveStatus);
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
  validateObjectIdParam("groupId"),
  updateAdminUserGroupMembers,
);
router.get("/notifications/config", getAdminCampaignConfig);
router.post("/notifications/send", sendAdminCampaign);
router.get("/options/icon-catalog", getOptionIconCatalog);
router.patch(
  "/reported-users/:reportId/status",
  validateObjectIdParam("reportId"),
  updateReportedUserStatusAdmin,
);

router.get("/app-version", listAdminAppVersionsController);
router.post("/app-version", createAdminAppVersionController);
router.put(
  "/app-version/:id",
  validateObjectIdParam("id"),
  updateAdminAppVersionController,
);
router.delete(
  "/app-version/:id",
  validateObjectIdParam("id"),
  deleteAdminAppVersionController,
);

export default router;
