// import { parse, validate } from "@tma.js/init-data-node";
// new push
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import Slot from "../models/Slot.js";
import User from "../models/User.js";

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage"
);

// Generate JWT Token (id = userId)
const generateToken = (id) => {
  const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });
  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });

  return { accessToken, refreshToken };
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
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const isMatched = await user.comparePassword(password);

    if (isMatched) {
      await user.updateLastActive();
      const { accessToken, refreshToken } = generateToken(user?._id);
      res.status(200).json({
        user,
        accessToken,
        refreshToken,
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Google Login / Create User // app-focused
export const googleLogin = async (req, res) => {
  const { id_token } = req.body;
  try {
    const tickit = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = tickit.getPayload();
    const { email, sub: googleId, name, picture, email_verified } = payload;
    if (!email_verified) {
      return res.status(400).json("email not verified by google");
    }
    const uniqueUsername = await generateUniqueUsername(name);
    let isNewUser = false;
    let user = await User.findOne({ googleId });

    if (!user) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        existingUser.googleId = googleId;
        existingUser.emailVerified = email_verified;
        await existingUser.save();
        user = existingUser;
      } else {
        // if (!location || !Array.isArray(location.coordinates)) {
        //   console.log("location");
        //   delete userData.location;
        // }
        user = await User.create({
          googleId,
          email,
          username: uniqueUsername,
          emailVerified: email_verified,
          profilePicture: picture,
        });
        console.log("created user...");
        isNewUser = true;
      }
    }
    await user.updateLastActive();
    const { accessToken, refreshToken } = generateToken(user?._id);
    console.log({ accessToken, refreshToken });
    res.status(200).json({
      isNewUser,
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const googleLoginWeb = async (req, res) => {
  const { code } = req.body;
  console.log("code", code);
  try {
    const { tokens } = await client.getToken(code); // exchange code for tokens
    console.log("tokens", tokens);
    const tickit = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = await tickit.getPayload();
    console.log("payload", payload);
    const { email, sub: googleId, name, picture, email_verified } = payload;
    if (!email_verified) {
      return res.status(400).json("email not verified by google");
    }
    const uniqueUsername = await generateUniqueUsername(name);
    let isNewUser = false;
    let user = await User.findOne({ googleId });
    console.log("user 1", user);
    if (!user) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.log("existingUser", existingUser);
        existingUser.googleId = googleId;
        existingUser.emailVerified = email_verified;
        await existingUser.save();
        user = existingUser;
      } else {
        user = await User.create({
          googleId,
          email,
          username: uniqueUsername,
          emailVerified: email_verified,
          profilePicture: picture,
        });
        console.log("user created");
        isNewUser = true;
      }
    }
    console.log("updating last active");
    await user.updateLastActive();
    console.log("generating tokens");
    const { accessToken, refreshToken } = generateToken(user?._id);
    console.log("tokens :", { accessToken, refreshToken });
    res.status(200).json({
      isNewUser,
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const tma_login = async (req, res) => {
  const { initData } = req.body;
  // const bot_token = process.env.TMA_BOT_TOKEN;
  try {
    // const init_data = parse(initData);
    const { user } = initData;
    console.log("===> user", user);
    // validate(initData, bot_token);
    const uniqueUsername = await generateUniqueUsername(user?.username);
    let isNewUser = false;

    let _user = await User.findOne({ telegramId: user?.id });
    if (!_user) {
      _user = await User.create({
        telegramId: user?.id,
        username: uniqueUsername,
        profilePicture: user?.photo_url,
      });
      console.log("user created through tma");
      isNewUser = true;
    }
    await user.updateLastActive();
    console.log("generating tokens");
    const { accessToken, refreshToken } = generateToken(_user?._id);
    res.status(200).json({
      isNewUser,
      user: _user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const refreshToken = async (req, res) => {
  const { refreshToken: reqRefreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({
      error: "No refresh token provided",
    });
  }
  try {
    const decoded = jwt.verify(
      reqRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const newAccessToken = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
      }
    );
    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh token error", error);
    res.status(403).json({ error: "Invalid or expired refresh token" });
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
