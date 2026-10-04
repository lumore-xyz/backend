import { idsEqual } from "../utils/objectId.js";

export const requireUserOwnership = (req, res, next) => {
  const currentUserId = req.user?.id;
  const { userId } = req.params;

  if (!currentUserId) {
    return res.status(401).json({ message: "Unauthorized: No user data" });
  }

  if (!idsEqual(userId, currentUserId)) {
    return res
      .status(403)
      .json({ message: "Forbidden: Not allowed to perform this action" });
  }

  next();
};
