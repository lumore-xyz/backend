import { Router } from "express";
import {
  createPost,
  deletePost,
  getPostById,
  getUserPosts,
  updatePost,
} from "../controllers/post.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", protect, createPost);
router.get("/:userId", protect, getUserPosts);
router.get("/:id", protect, getPostById);
router.put("/:id", protect, updatePost);
router.delete("/:id", protect, deletePost);

export default router;
