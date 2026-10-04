import express from "express";

import {
  createLocationRoom,
  getLocationRoomDetail,
  getNearbyLocationRooms,
  startLocationRoomMatchNow,
  updateLocationRoom,
} from "../controllers/locationRoom.controller.js";
import {
  leaveLocationRoomPool,
  pinLocationRoom,
  rejoinLocationRoomPool,
  unpinLocationRoom,
} from "../controllers/locationRoomPool.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect);
router.param("roomId", validateObjectIdParam("roomId"));

router.post("/", upload.single("image"), createLocationRoom);
router.get("/nearby", getNearbyLocationRooms);
router.get("/:roomId", getLocationRoomDetail);
router.patch(
  "/:roomId",
  upload.single("image"),
  updateLocationRoom,
);
router.post(
  "/:roomId/start-match",
  startLocationRoomMatchNow,
);
router.post("/:roomId/pin", pinLocationRoom);
router.post(
  "/:roomId/rejoin",
  rejoinLocationRoomPool,
);
router.post(
  "/:roomId/leave-pool",
  leaveLocationRoomPool,
);
router.post("/:roomId/unpin", unpinLocationRoom);

export default router;
