import { POST_LIMITS } from "../config/postLimits.js";
import { Post } from "../models/post.model.js";
import UnlockHistory from "../models/unlock.model.js";
import { idsEqual } from "../utils/objectId.js";
import { logError } from "../utils/logError.js";
import { deleteFile, extractPublicIdFromUrl, uploadImage } from "./file.service.js";

export const canCreatePost = async ({ userId, type }) => {
  const limit = POST_LIMITS[type];

  const count = await Post.countDocuments({
    userId,
    type,
  });

  return count < limit;
};

export const createUserPost = async ({
  userId,
  type,
  content = {},
  visibility,
  image,
}) => {
  let resolvedContent = content;
  let uploadedImage;
  if (type === "IMAGE") {
    uploadedImage = await uploadImage({
      buffer: image.buffer,
      folder: "post_images",
      maxWidth: 1400,
      maxHeight: 1400,
    });
    resolvedContent = { ...content, imageUrls: uploadedImage.secure_url };
  }

  try {
    return await Post.create({ userId, type, content: resolvedContent, visibility });
  } catch (error) {
    if (uploadedImage?.public_id) {
      await deleteFile(uploadedImage.public_id).catch((cleanupError) =>
        logError("Failed to clean up post image after create failure", cleanupError),
      );
    }
    throw error;
  }
};

const getAllowedVisibilities = async ({ userId, viewerId, visibility }) => {
  if (idsEqual(userId, viewerId)) return null;
  if (visibility === "public") return ["public"];
  if (visibility && visibility !== "unlocked") return [];

  const isUnlocked = await UnlockHistory.exists({
    user: userId,
    unlockedUser: viewerId,
  });
  return isUnlocked ? ["public", "unlocked"] : ["public"];
};

export const getPostsForViewer = async ({ userId, viewerId }) => {
  const allowedVisibilities = await getAllowedVisibilities({ userId, viewerId });

  const query = { userId };
  if (allowedVisibilities) query.visibility = { $in: allowedVisibilities };

  return Post.find(query)
    .sort({ createdAt: -1 })
    .populate("content.promptId")
    .lean();
};

export const getPostById = async ({ postId, viewerId }) => {
  const post = await Post.findById(postId).populate("content.promptId").lean();
  if (!post) return null;

  const allowedVisibilities = await getAllowedVisibilities({
    userId: post.userId,
    viewerId,
    visibility: post.visibility,
  });
  return !allowedVisibilities || allowedVisibilities.includes(post.visibility)
    ? post
    : null;
};

export const updateUserPost = ({ postId, userId, content, visibility }) =>
  Post.findOneAndUpdate(
    { _id: postId, userId },
    { content, visibility },
    { returnDocument: "after" },
  );

export const deleteUserPost = async ({ postId, userId }) => {
  const post = await Post.findOne({ _id: postId, userId });
  if (!post) return false;

  if (post.type === "IMAGE" && post.content?.imageUrls) {
    try {
      const publicId = extractPublicIdFromUrl(post.content.imageUrls);
      if (publicId) await deleteFile(publicId, "image");
    } catch (error) {
      logError("Error deleting post image", error);
    }
  }

  await post.deleteOne();
  return true;
};
