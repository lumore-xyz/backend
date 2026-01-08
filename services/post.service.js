import { POST_LIMITS } from "../config/postLimits.js";
import { Post } from "../models/post.model.js";

export const canCreatePost = async ({ userId, type }) => {
  const limit = POST_LIMITS[type];

  const count = await Post.countDocuments({
    userId,
    type,
  });

  return count < limit;
};

// Example
// if (!(await canCreatePost({ userId, type }))) {
//   throw new Error(
//     `You’ve reached the ${POST_LIMITS[type]} ${type.toLowerCase()} post limit`
//   );
// }
