import { Request } from "express";
import { Document } from "mongoose";

export interface IUser extends Document {
  id: string;
  username: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  visibleName?: string;
  hiddenName?: string;
  gender?: "Male" | "Female" | "Non-Binary";
  dob?: Date;
  bio?: string;
  interests?: {
    professional: string[];
    hobbies: string[];
  };
  isVerified: boolean;
  isActive: boolean;
  lastActive: Date;
  maxSlots: number;
  location?: {
    type: string;
    coordinates: number[];
    formattedAddress?: string;
  };
  googleId?: string;
  googleEmail?: string;
  comparePassword(password: string): Promise<boolean>;
}

export interface AuthRequest extends Request {
  user?: IUser;
}

export interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}
