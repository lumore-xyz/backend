// /routes/profileRoutes.js
import express from "express";

import { getRoomMessages } from "../controllers/message.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/:roomId", protect, getRoomMessages);

export default router;
