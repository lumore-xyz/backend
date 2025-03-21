// config/db.js
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", true); // Avoids deprecation warnings

    const URI = process.env.MONGODB_URI;
    if (!URI) throw new Error("MONGODB_URI missing");

    const conn = await mongoose.connect(URI);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Exit process with failure
  }
};

export default connectDB;
