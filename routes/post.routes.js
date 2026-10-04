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

router.use(protect);
router.param("id", validateObjectIdParam("id"));
router.param("userId", validateObjectIdParam("userId"));

router.post(
  "/",
  postCreateLimiter,
  upload.single("image"),
  validateCreatePost,
  createPost,
);
router.get("/by-id/:id", getPostById);
router.get("/:userId", getUserPosts);
router.put(
  "/:id",
  validateUpdatePost,
  updatePost,
);
router.delete("/:id", deletePost);

export default router;
