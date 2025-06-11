// /routes/profileRoutes.js
import express from "express";

import { protect } from "../middleware/authMiddleware.js";
import { getRoomMessages } from "../controllers/messagesController.js";


const router = express.Router();

router.get("/:roomId", protect, getRoomMessages);


export default router;