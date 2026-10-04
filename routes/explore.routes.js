import express from "express";
import {
  getCompatibility,
  getExplore,
  refreshExplore,
  rejectProfile,
  startConversation,
  unlockExplore,
} from "../controllers/explore.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();
const unlockLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => String(req.user.id),
  message: {
    success: false,
    message: "Too many Explore requests; try again later",
  },
});
router.use(protect);
router.param("profileId", validateObjectIdParam("profileId"));

router.get("/", getExplore);
router.get(
  "/profiles/:profileId/compatibility",
  unlockLimiter,
  getCompatibility,
);
router.post("/unlock", unlockLimiter, unlockExplore);
router.post("/refresh", unlockLimiter, refreshExplore);
router.post(
  "/profiles/:profileId/conversation",
  unlockLimiter,
  startConversation,
);
router.post(
  "/profiles/:profileId/reject",
  unlockLimiter,
  rejectProfile,
);
export default router;
