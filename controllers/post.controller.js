import { Post } from "../models/post.model.js";
import UnlockHistory from "../models/unlock.model.js";
import { canCreatePost } from "../services/post.service.js";

/**
 * CREATE POST
 */
export const createPost = async (req, res) => {
  const userId = req.user.id;
  const { type, content, visibility } = req.body;

  const allowed = await canCreatePost({ userId, type });
  if (!allowed) {
    return res.status(400).json({
      message: `Post limit reached for ${type}`,
    });
  }

  const post = await Post.create({
    userId,
    type,
    content,
    visibility,
  });

  res.status(201).json(post);
};

/**
 * GET USER POSTS (viewer-aware)
 */
export const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params; // profile being viewed
    const viewerId = req.user.id; // logged-in user

    if (!userId || !viewerId) {
      return res.status(400).json({ message: "Invalid request" });
    }

    // Viewer is profile owner → return everything
    if (userId === viewerId) {
      const posts = await Post.find({ userId })
        .sort({ createdAt: -1 })
        .populate("content.promptId");

      return res.json(posts);
    }

    // Check unlock relationship
    const isViewerUnlockedByUser =
      (await UnlockHistory.countDocuments({
        user: userId, // profile owner
        unlockedUser: viewerId,
      })) > 0;

    /**
     * Visibility rules
     */
    const allowedVisibilities = ["public"];

    if (isViewerUnlockedByUser) {
      allowedVisibilities.push("unlock");
    }

    const posts = await Post.find({
      userId,
      visibility: { $in: allowedVisibilities },
    })
      .sort({ createdAt: -1 })
      .populate("content.promptId");

    return res.json({
      isViewerUnlockedByUser,
      posts,
    });
  } catch (error) {
    console.error("Error fetching user posts:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET SINGLE POST
 */
export const getPostById = async (req, res) => {
  const post = await Post.findById(req.params.id).populate("content.promptId");

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json(post);
};

/**
 * UPDATE POST
 */
export const updatePost = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const post = await Post.findOneAndUpdate(
    { _id: id, userId },
    { content: req.body.content, visibility: req.body.visibility },
    { new: true }
  );

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json(post);
};

/**
 * DELETE POST
 */
export const deletePost = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const post = await Post.findOneAndDelete({ _id: id, userId });

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json({ success: true });
};
