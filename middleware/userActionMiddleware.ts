/// /middleware/userActionMiddleware.js
import { Request, Response, NextFunction } from "express";
import { RequestUser } from "../types/request.js";

export const userControl = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id: _userId } = req.user as RequestUser;
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
