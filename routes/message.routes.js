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
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();
router.use(protect);
router.param("roomId", validateObjectIdParam("roomId"));

router.get("/:roomId", getRoomMessages);
router.post("/:roomId/image", upload.single("image"), uploadRoomImage);
router.post("/:roomId/audio", uploadAudio.single("audio"), uploadRoomAudio);
router.delete("/image-temp", deleteTempRoomImage);
router.delete("/audio-temp", deleteTempRoomAudio);

export default router;
