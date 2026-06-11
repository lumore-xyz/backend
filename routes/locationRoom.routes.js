import express from "express";

import {
  createLocationRoom,
  getLocationRoomDetail,
  getNearbyLocationRooms,
  leaveLocationRoomPool,
  pinLocationRoom,
  rejoinLocationRoomPool,
  startLocationRoomMatchNow,
  unpinLocationRoom,
  updateLocationRoom,
} from "../controllers/locationRoom.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.post("/", protect, upload.single("image"), createLocationRoom);
router.get("/nearby", protect, getNearbyLocationRooms);
router.get("/:roomId", protect, validateObjectIdParam("roomId"), getLocationRoomDetail);
router.patch(
  "/:roomId",
  protect,
  validateObjectIdParam("roomId"),
  upload.single("image"),
  updateLocationRoom,
);
router.post(
  "/:roomId/start-match",
  protect,
  validateObjectIdParam("roomId"),
  startLocationRoomMatchNow,
);
router.post("/:roomId/pin", protect, validateObjectIdParam("roomId"), pinLocationRoom);
router.post(
  "/:roomId/rejoin",
  protect,
  validateObjectIdParam("roomId"),
  rejoinLocationRoomPool,
);
router.post(
  "/:roomId/leave-pool",
  protect,
  validateObjectIdParam("roomId"),
  leaveLocationRoomPool,
);
router.post("/:roomId/unpin", protect, validateObjectIdParam("roomId"), unpinLocationRoom);

export default router;
