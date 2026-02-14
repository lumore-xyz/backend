/// /middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { grantDailyActiveBonus } from "../services/credits.service.js";

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
    return res
      .status(401)
      .json({ message: "Not authorized, no token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.warn("[authMiddleware] User not found for ID:", decoded.id);
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user; // Attach user to request object
    grantDailyActiveBonus(user._id, new Date()).catch((err) => {
      console.error("[credits] Failed to grant daily active bonus:", err?.message || err);
    });
    next();
  } catch (error) {
    console.error("JWT Authentication Error:", error);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};
