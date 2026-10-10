import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { deleteUnderageAccounts } from "../services/accountDeletion.service.js";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");

try {
  await connectDB();
  const result = await deleteUnderageAccounts({ execute: process.argv.includes("--execute") });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await mongoose.disconnect();
}
