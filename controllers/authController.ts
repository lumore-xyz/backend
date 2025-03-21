// /controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Slot from "../models/Slot.js";
import User from "../models/User.js";
import { NextFunction, Request, Response } from "express";

// Generate JWT Token
const generateToken = (id: any) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error("JWT_SECRET not found");
  jwt.sign({ id }, JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Signup user
export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { username, password } = req.body;

  try {
    // Check for existing user
    const existingUser = await User.findOne({
      username,
    });

    if (existingUser) {
      res.status(400).json({ message: "Username already in use" });
    }

    // Create user
    const user = await User.create({
      username,
      password,
    });

    // Create a free slot for the new user
    await Slot.create({ user: user._id, profile: null });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      token: generateToken(user._id),
    });
  } catch (error: unknown) {
    next(error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

// Local Login
export const login = async (req: Request, res: Response) => {
  const { identifier, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { username: identifier },
        { phoneNumber: identifier },
      ],
    }).select("+password"); // Ensure password is retrieved

    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

// Google Login / Create User
export const googleLogin = async (req: Request, res: Response) => {
  try {
    if (req.user) {
      // Extract user from Passport's req.user
      let { googleId, email, username } = req.user as {
        googleId: string;
        email: string;
        username: string;
      };
      // const uniqueUsername = await generateUniqueUsername(username);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      let setPassword = false;
      let user = await User.findOne({ googleId });

      if (!user) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          existingUser.googleId = googleId;
          await existingUser.save();
          user = existingUser;
        } else {
          user = await User.create({
            googleId,
            email,
            username,
          });
        }
      }
      // Ensure user is defined before checking password
      if (!user?.password) {
        setPassword = true;
      }
      res.redirect(
        `${frontendUrl}/auth/callback?_id=${user._id}&token=${generateToken(
          user._id
        )}&email=${email}&username=${username}&setPassword=${setPassword}`
      );
    } else {
      // req.user is undefined
      res.status(401).json({ message: "User not authenticated" });
    }
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

// Set Password for Google Users
export const setPassword = async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  if (!req.user) throw new Error("user not authenticated");
  const { id: userId } = req.user as {
    id: string;
  };

  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
      // res.status(404).json({ message: "User not found" });
    }

    if (!user?.googleId) {
      res.status(400).json({ message: "Password already set" });
    }

    // Hash new password before saving
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password set successfully" });
  } catch (error: unknown) {
    res.status(500).json({
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

// velidate username is unique
export const isUniqueUsername = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const exists = await User.exists({ username });

    res.json({ isUnique: !exists }); // ✅  JSON response
  } catch (error: unknown) {
    console.error("Error checking username uniqueness:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "An error occurred",
    });
  }
};

export async function generateUniqueUsername(name: string) {
  let baseUsername = generateCleanUsername(name);

  // If base username is empty, default to 'user'
  if (!baseUsername) baseUsername = "user";

  let exists = await User.findOne({ username: baseUsername });

  if (!exists) baseUsername; // If username is unique,  it

  // Generate new usernames in bulk (up to 10 variations per query)
  let counter = 1;
  let newUsername = `${baseUsername}_${counter}`;

  while (await User.findOne({ username: newUsername })) {
    counter++;
    newUsername = `${baseUsername}_${counter}`;

    // Avoid infinite loops by limiting iterations
    if (counter > 100) throw new Error("Failed to generate a unique username.");
  }

  newUsername;
}
export function generateCleanUsername(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "") // Remove apostrophes and similar characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-z0-9._]/g, "") // Remove special characters except dots and underscores
    .replace(/\.{2,}/g, ".") // Replace multiple dots with a single dot
    .replace(/^\.|\.$/g, ""); // Remove leading/trailing dots
}
