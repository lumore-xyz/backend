import rateLimit from "express-rate-limit";

export const createRateLimiter = (options) =>
  rateLimit({ standardHeaders: true, legacyHeaders: false, ...options });

export const postCreateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many posts created, please try again later." },
});

export const profileUpdateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { message: "Too many profile updates, please slow down." },
});

export const profilePictureLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { message: "Too many uploads, please try again later." },
});

