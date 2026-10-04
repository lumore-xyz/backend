import express from "express";
import { createUpdateProfile } from "../controllers/profile.controller.js";
import { getProfile } from "../controllers/profileRead.controller.js";
import { updateFieldVisibility } from "../controllers/profileVisibility.controller.js";
import { updateProfilePicture } from "../controllers/profilePicture.controller.js";
import { deleteAccount } from "../controllers/account.controller.js";
import { updateUserLocation } from "../controllers/profileLocation.controller.js";
import {
  getUserPreference,
  updateUserPreference,
} from "../controllers/profilePreference.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  profilePictureLimiter,
  profileUpdateLimiter,
} from "../middleware/rateLimit.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { requireUserOwnership } from "../middleware/userOwnership.middleware.js";
import {
  validateObjectIdParam,
  validateUpdateLocation,
} from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect);
router.param("userId", validateObjectIdParam("userId"));

router
  .route("/:userId")
  .post(
    profileUpdateLimiter,
    requireUserOwnership,
    createUpdateProfile,
  )
  .patch(
    profileUpdateLimiter,
    requireUserOwnership,
    createUpdateProfile,
  )
  .get(getProfile)
  .delete(
    requireUserOwnership,
    deleteAccount,
  );

router.post(
  "/:userId/update-location",
  validateUpdateLocation,
  requireUserOwnership,
  updateUserLocation,
);
router.patch(
  "/:userId/visibility",
  requireUserOwnership,
  updateFieldVisibility,
);

router
  .route("/:userId/preferences")
  .get(
    requireUserOwnership,
    getUserPreference,
  )
  .patch(
    requireUserOwnership,
    updateUserPreference,
  );

router.patch(
  "/:userId/update-profile-picture",
  requireUserOwnership,
  profilePictureLimiter,
  upload.single("profilePic"),
  updateProfilePicture,
);

export default router;
