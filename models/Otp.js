const otpSchema = new mongoose.Schema({
  userId: mongoose.Types.ObjectId,
  target: String, // email or phone
  type: { type: String, enum: ["email", "phone"] },
  otp: String,
  expiresAt: Date,
});
