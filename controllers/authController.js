// /controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Signup user
export const signup = async (req, res) => {
  const { username, email, phoneNumber, password } = req.body;

  try {
    if (!email && !phoneNumber) {
      return res
        .status(400)
        .json({ message: "Email or phone number is required" });
    }

    // Check for existing user
    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }, { username }],
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username, email, or phone number already in use" });
    }

    // Create user
    const user = await User.create({
      username,
      email: email || undefined,
      phoneNumber: phoneNumber || undefined,
      password,
    });

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Local Login
export const login = async (req, res) => {
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Google Login / Create User
export const googleLogin = async (req, res) => {
  try {
    // Extract user from Passport's req.user
    const { googleId, email, username } = req.user;

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
          isVerified: true,
        });
      }
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Set Password for Google Users
export const setPassword = async (req, res) => {
  const { userId, newPassword } = req.body;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.googleId) {
      return res.status(400).json({ message: "Password already set" });
    }

    // Hash new password before saving
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password set successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
