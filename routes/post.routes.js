import { Router } from "express";
import {
  createPost,
  deletePost,
  getPostById,
  getUserPosts,
  updatePost,
} from "../controllers/post.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { postCreateLimiter } from "../middleware/rateLimit.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import {
  validateCreatePost,
  validateObjectIdParam,
  validateUpdatePost,
} from "../middleware/validate.middleware.js";

const router = Router();

router.post(
  "/",
  protect,
  postCreateLimiter,
  upload.single("image"),
  validateCreatePost,
  createPost,
);
router.get("/:userId", protect, validateObjectIdParam("userId"), getUserPosts);
router.get("/:id", protect, validateObjectIdParam("id"), getPostById);
router.put(
  "/:id",
  protect,
  validateObjectIdParam("id"),
  validateUpdatePost,
  updatePost,
);
router.delete("/:id", protect, validateObjectIdParam("id"), deletePost);

export default router;
