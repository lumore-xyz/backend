import User from "../models/user.model.js";
import {
  generateAccessToken,
  generateAuthTokens,
  verifyRefreshToken,
} from "./authToken.service.js";
import { grantSignupBonusIfMissing } from "./signupCredits.service.js";
import { generateUniqueUsername } from "./username.service.js";
import { getAge } from "../utils/age.js";

const createNewAccountUser = async (userData) => {
  const user = await User.create(userData);
  await grantSignupBonusIfMissing(user._id);
  return user;
};

export const createLocalAccount = async ({ email, password }) => {
  const existingUser = await User.findOne({ email }).select("_id");
  if (existingUser) return { error: "EMAIL_TAKEN" };

  const username = await generateUniqueUsername(email.split("@")[0] || "user");
  const user = await createNewAccountUser({ username, email, password });
  return { user, ...generateAuthTokens(user._id) };
};

export const authenticateLocalUser = async ({ identifier, password }) => {
  if (typeof password !== "string" || !password) return null;

  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  });
  if (
    user?.isArchived ||
    (user?.dob && getAge(user.dob) < 18) ||
    !user?.password ||
    !(await user.comparePassword(password))
  ) {
    return null;
  }

  await user.updateLastActive();
  return { user, ...generateAuthTokens(user._id) };
};

export const authenticateGoogleUser = async (payload) => {
  const {
    email,
    sub: googleId,
    name,
    picture,
    email_verified: emailVerified,
  } = payload;
  if (!emailVerified) return { emailNotVerified: true };

  let user = await User.findOne({ googleId });
  let isNewUser = false;
  if (!user) {
    user = await User.findOne({ email });
    if (user?.isArchived) return { accountArchived: true };
    if (user) {
      user.googleId = googleId;
      user.emailVerified = emailVerified;
      await user.save();
    } else {
      user = await createNewAccountUser({
        googleId,
        email,
        username: await generateUniqueUsername(name),
        emailVerified,
        profilePicture: picture,
      });
      isNewUser = true;
    }
  }

  if (user.isArchived) return { accountArchived: true };
  if (user.dob && getAge(user.dob) < 18) return { underage: true };
  if (!isNewUser) await user.updateLastActive();
  return { isNewUser, user, ...generateAuthTokens(user._id) };
};

export const authenticateAdminGoogleUser = async (payload) => {
  const { email, sub: googleId, email_verified: emailVerified } = payload;
  if (!emailVerified) return { error: "EMAIL_NOT_VERIFIED" };

  const user = await User.findOne({ email }).select("-password");
  if (!user?.isAdmin || user.isArchived) {
    return { error: "ADMIN_ACCESS_DENIED" };
  }

  if (!user.googleId) {
    user.googleId = googleId;
    user.emailVerified = true;
    await user.save();
  }

  await user.updateLastActive();
  return { user, ...generateAuthTokens(user._id) };
};

export const authenticateTelegramUser = async (telegramUser) => {
  let user = await User.findOne({ telegramId: telegramUser?.id });
  if (user?.isArchived) return { accountArchived: true };
  if (user?.dob && getAge(user.dob) < 18) return { underage: true };
  let isNewUser = false;
  if (!user) {
    user = await createNewAccountUser({
      telegramId: telegramUser?.id,
      username: await generateUniqueUsername(telegramUser?.username),
      profilePicture: telegramUser?.photo_url,
    });
    isNewUser = true;
  }

  if (!isNewUser) await user.updateLastActive();
  return { isNewUser, user, ...generateAuthTokens(user._id) };
};

export const getRefreshedAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (cause) {
    if (
      !["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
        cause?.name,
      )
    ) {
      throw cause;
    }
    throw Object.assign(new Error("Invalid or expired refresh token", { cause }), {
      statusCode: 403,
    });
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }
  return !user.isArchived && (!user.dob || getAge(user.dob) >= 18)
    ? generateAccessToken(user._id)
    : null;
};
