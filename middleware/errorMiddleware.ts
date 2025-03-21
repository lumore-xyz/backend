import { Request, Response, NextFunction } from "express";
import { ErrorWithStatusCode } from "../types/index.js";

// /middleware/errorMiddleware.js
const errorHandler = (
  err: ErrorWithStatusCode,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || res.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Server Error",
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

// 404 Not Found Middleware
const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(
    `Not Found - ${req.originalUrl}`
  ) as ErrorWithStatusCode;
  error.statusCode = 404;
  next(error);
};

export { errorHandler, notFound };
