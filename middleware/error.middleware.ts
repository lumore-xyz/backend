// /middleware/error.middleware.js
const errorHandler = (err, req, res, next) => {
  const error = err as Error & { statusCode?: number };
  const statusCode = error.statusCode || res.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || "Server Error",
    stack: process.env.NODE_ENV === "production" ? null : error.stack,
  });
};

// 404 Not Found Middleware
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`) as Error & {
    statusCode?: number;
  };
  error.statusCode = 404;
  next(error);
};

export { errorHandler, notFound };
