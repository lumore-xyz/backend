import mongoose from "mongoose";

const connectDB = async () => {
  mongoose.set("strictQuery", true);

  const conn = await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB connected: ${conn.connection.host}`);
};

export default connectDB;
