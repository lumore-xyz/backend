/// /middleware/authMiddleware.js
import jwt, { JwtPayload } from "jsonwebtoken";
import User from "../models/User.js";
import { Request, Response, NextFunction } from "express";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let token;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) throw new Error("No token found");
  if (!JWT_SECRET) throw new Error("JWT_SECRET missing in .env");

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      throw new Error("User not found");
    }
    req.user = user; // Attach user to request object
    next();
  } catch (error) {
    console.error("JWT Authentication Error:", error);
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};
