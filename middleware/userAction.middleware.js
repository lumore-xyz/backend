/// /middleware/userActionMiddleware.js

export const userControl = (req, res, next) => {
  const _userId = req.user?.id; // Handle potential nullish req.user
  const { userId } = req.params;

  if (!_userId) {
    return res.status(401).json({ message: "Unauthorized: No user data" });
  }

  if (userId.toString() !== _userId.toString()) {
    return res
      .status(403)
      .json({ message: "Forbidden: Not allowed to perform this action" });
  }

  next();
};
