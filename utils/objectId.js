import { Types } from "mongoose";

export const isValidObjectId = (value) => {
  if (!value) return false;
  if (value instanceof Types.ObjectId) return true;
  return Types.ObjectId.isValid(String(value));
};

export const toObjectId = (value) => {
  if (!value) return null;
  return value instanceof Types.ObjectId
    ? value
    : new Types.ObjectId(String(value));
};

export const idsEqual = (first, second) =>
  first != null && second != null && first.toString() === second.toString();
