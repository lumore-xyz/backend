import jwt from "jsonwebtoken";
import Slot from "../models/Slot.js";
import User from "../models/User.js";

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Signup user
export const signup = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check for existing user
    const existingUser = await User.findOne({
      username,
      email,
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username already in use" });
    }

    if (userData.location && !Array.isArray(userData.location.coordinates)) {
      delete userData.location; // ⛔ Prevent MongoDB from seeing invalid location
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
    });

    // Create a free slot for the new user
    await Slot.create({ user: user._id, profile: null });

    await user.updateLastActive();

    res.status(201).json({
      _id: user._id,
      username: user.username,
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
    console.log("Login attempt for identifier:", identifier);

    const user = await User.findOne({
      $or: [
        { email: identifier },
        { username: identifier },
        { phoneNumber: identifier },
      ],
    }).select("+password"); // Ensure password is retrieved

    if (!user) {
      console.log("No user found with identifier:", identifier);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log("User found, comparing passwords");
    const isMatch = await user.comparePassword(password);
    console.log("Password match result:", isMatch);

    if (isMatch) {
      await user.updateLastActive();
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
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Google Login / Create User
export const googleLogin = async (req, res) => {
  try {
    // Extract user from Passport's req.user
    let { googleId, email, username } = req.user;
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
        if (!location || !Array.isArray(location.coordinates)) {
          delete userData.location;
        }
        user = await User.create({
          googleId,
          email,
          username,
          emailVerified: true,
        });
      }
    }
    // Ensure user is defined before checking password
    if (!user?.password) {
      setPassword = true;
    }
    await user.updateLastActive();

    res.redirect(
      `${frontendUrl}/auth/callback?_id=${user._id}&token=${generateToken(
        user._id
      )}&email=${req.user.email}&username=${
        req.user.username
      }&setPassword=${setPassword}`
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Set Password for Google Users
export const setPassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.googleId) {
      return res.status(400).json({ message: "Password already set" });
    }

    // Hash new password before saving
    user.password = newPassword; // Set the raw password, let the pre-save hook hash it
    await user.save();

    // Verify the password was set correctly
    const updatedUser = await User.findById(userId).select("+password");
    if (!updatedUser.password) {
      return res.status(500).json({ message: "Failed to set password" });
    }

    await user.updateLastActive();
    res.json({ message: "Password set successfully" });
  } catch (error) {
    console.error("Set password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// velidate username is unique
export const isUniqueUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const exists = await User.exists({ username });

    return res.json({ isUnique: !exists }); // ✅ Return JSON response
  } catch (error) {
    console.error("Error checking username uniqueness:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export async function generateUniqueUsername(name) {
  let baseUsername = generateCleanUsername(name);

  // If base username is empty, default to 'user'
  if (!baseUsername) baseUsername = "user";

  let exists = await User.findOne({ username: baseUsername });

  if (!exists) return baseUsername; // If username is unique, return it

  // Generate new usernames in bulk (up to 10 variations per query)
  let counter = 1;
  let newUsername = `${baseUsername}_${counter}`;

  while (await User.findOne({ username: newUsername })) {
    counter++;
    newUsername = `${baseUsername}_${counter}`;

    // Avoid infinite loops by limiting iterations
    if (counter > 100) throw new Error("Failed to generate a unique username.");
  }

  return newUsername;
}
export function generateCleanUsername(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "") // Remove apostrophes and similar characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-z0-9._]/g, "") // Remove special characters except dots and underscores
    .replace(/\.{2,}/g, ".") // Replace multiple dots with a single dot
    .replace(/^\.|\.$/g, ""); // Remove leading/trailing dots
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}
