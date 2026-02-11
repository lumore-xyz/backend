import type { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: string;
        _id?: string;
        [key: string]: any;
      };
      file?: any;
      files?: any;
    }
  }
}

export {};
