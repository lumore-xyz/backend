import express from "express";

import { getInbox, getRoomData } from "../controllers/matchRoom.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getInbox);
router.get("/:roomId", protect, getRoomData);

export default router;
