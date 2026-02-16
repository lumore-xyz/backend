// /routes/profileRoutes.js
import express from "express";

import {
  deleteTempRoomImage,
  getRoomMessages,
  uploadRoomImage,
} from "../controllers/message.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/:roomId", protect, getRoomMessages);
router.post("/:roomId/image", protect, upload.single("image"), uploadRoomImage);
router.delete("/image-temp", protect, deleteTempRoomImage);

export default router;
