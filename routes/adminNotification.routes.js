import express from "express";
import {
  adminCreateBulkSystemNotifications,
  adminCreateSystemNotification,
} from "../controllers/adminNotification.controller.js";

const router = express.Router();

router.post("/system", adminCreateSystemNotification);
router.post("/system/bulk", adminCreateBulkSystemNotifications);

export default router;
