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
  age?: string;
  dob?: Date;
  bio?: string;
  interests?: {
    professional: string[];
    hobbies: string[];
  };
  sexualOrientation?: string;
  isVerified: boolean;
  isActive: boolean;
  lastActive: Date;
  maxSlots: number;
  location?: {
    type: string;
    coordinates: [number, number];
    formattedAddress?: string;
  };
  googleId?: string;
  googleEmail?: string;
  comparePassword(password: string): Promise<boolean>;
}

export type GoalType =
  | "Serious Relationship"
  | "Casual Dating"
  | "Marriage"
  | "Friendship"
  | "Quick Sex"
  | "Undecided"
  | "Long-Term Dating"
  | "Open Relationship"
  | "Networking"
  | "Exploring Sexuality"
  | "Travel Companion"
  | "Polyamorous Relationship"
  | "Activity Partner"
  | "Sugar Dating"
  | "Spiritual Connection";

export interface IFilter {
  _id: { $ne: unknown; $nin: (null | undefined)[] };
  dob: { $gte: Date; $lte: Date };
  location: {
    $near: {
      $geometry: { type: string; coordinates: [number, number] | undefined };
      $maxDistance: number;
    };
  };
  gender?: string;
}

export interface IPreferences extends Document {
  user: IUser["_id"];
  gender: "Male" | "Female" | "Non-Binary" | "Any";
  ageRange: {
    min: number;
    max: number;
  };
  distance: number;
  goal: {
    primary?: GoalType;
    secondary?: GoalType;
    tertiary?: GoalType;
  };
}

export interface AuthRequest extends Request {
  user?: IUser;
}

export interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}

export interface ProfileData {
  _id: any;
  visibleName?: string;
  age?: string;
  gender?: "Male" | "Female" | "Non-Binary";
  bio?: string;
  photos: any;
  distance: number;
}
