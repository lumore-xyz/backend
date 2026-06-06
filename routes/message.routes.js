// /routes/profileRoutes.js
import express from "express";

import {
  deleteTempRoomAudio,
  deleteTempRoomImage,
  getRoomMessages,
  uploadRoomAudio,
  uploadRoomImage,
} from "../controllers/message.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload, uploadAudio } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/:roomId", protect, getRoomMessages);
router.post("/:roomId/image", protect, upload.single("image"), uploadRoomImage);
router.post("/:roomId/audio", protect, uploadAudio.single("audio"), uploadRoomAudio);
router.delete("/image-temp", protect, deleteTempRoomImage);
router.delete("/audio-temp", protect, deleteTempRoomAudio);

export default router;
