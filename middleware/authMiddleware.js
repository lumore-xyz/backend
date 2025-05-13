/// /middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    console.warn("[authMiddleware] No token provided");
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("[authMiddleware] Decoded:", decoded);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.warn("[authMiddleware] User not found for ID:", decoded.id);
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user; // Attach user to request object
    console.log("[authMiddleware] Authenticated user:", user._id);
    next();
  } catch (error) {
    console.error("JWT Authentication Error:", error);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};
