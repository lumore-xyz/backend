import { logError } from "../utils/logError.js";

// /middleware/error.middleware.js
const errorHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  const multerStatus =
    err.name === "MulterError"
      ? err.code === "LIMIT_FILE_SIZE"
        ? 413
        : 400
      : null;
  const statusCode =
    err.statusCode ||
    err.status ||
    multerStatus ||
    (res.statusCode !== 200 ? res.statusCode : 500);
  const isServerError = statusCode >= 500;

  if (isServerError) logError("Unhandled request error", err);

  res.status(statusCode).json({
    success: false,
    message: isServerError ? "Server Error" : err.message || "Server Error",
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

// 404 Not Found Middleware
const notFound = (_req, res, next) => {
  const error = new Error("Not Found");
  error.statusCode = 404;
  next(error);
};

export { errorHandler, notFound };
