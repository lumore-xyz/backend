import {
  canCreatePost,
  createUserPost,
  deleteUserPost,
  getPostById as findPostById,
  getPostsForViewer,
  updateUserPost,
} from "../services/post.service.js";

export const createPost = async (req, res) => {
  const userId = req.user.id;
  const { type, content, visibility } = req.body || {};

  const allowed = await canCreatePost({ userId, type });
  if (!allowed) {
    return res.status(400).json({
      message: `Post limit reached for ${type}`,
    });
  }

  if (type === "IMAGE" && !req.file?.buffer) {
    return res.status(400).json({ message: "No image uploaded" });
  }

  const post = await createUserPost({
    userId,
    type,
    content: content ?? {},
    visibility,
    image: req.file,
  });

  return res.status(201).json(post);
};

export const getUserPosts = async (req, res) => {
  const { userId } = req.params;
  const viewerId = req.user.id;
  const posts = await getPostsForViewer({ userId, viewerId });
  return res.json(posts);
};

export const getPostById = async (req, res) => {
  const post = await findPostById({
    postId: req.params.id,
    viewerId: req.user.id,
  });
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json(post);
};

export const updatePost = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const post = await updateUserPost({
    postId: id,
    userId,
    content: req.body.content,
    visibility: req.body.visibility,
  });

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json(post);
};

export const deletePost = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!(await deleteUserPost({ postId: id, userId }))) {
    return res.status(404).json({ message: "Post not found" });
  }
  res.json({ success: true });
};

