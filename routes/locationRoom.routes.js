import express from "express";

import {
  createLocationRoom,
  getLocationRoomDetail,
  getNearbyLocationRooms,
  pinLocationRoom,
  rejoinLocationRoomPool,
  unpinLocationRoom,
} from "../controllers/locationRoom.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.post("/", protect, upload.single("image"), createLocationRoom);
router.get("/nearby", protect, getNearbyLocationRooms);
router.get("/:roomId", protect, validateObjectIdParam("roomId"), getLocationRoomDetail);
router.post("/:roomId/pin", protect, validateObjectIdParam("roomId"), pinLocationRoom);
router.post(
  "/:roomId/rejoin",
  protect,
  validateObjectIdParam("roomId"),
  rejoinLocationRoomPool,
);
router.post("/:roomId/unpin", protect, validateObjectIdParam("roomId"), unpinLocationRoom);

export default router;
