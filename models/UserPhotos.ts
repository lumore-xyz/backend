import mongoose from "mongoose";

const userPhotosSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  photoUrl: {
    type: String,
    validate: {
      validator: (v: string) => /^(http|https):\/\/[^ "]+$/.test(v),
      message: "Invalid photo URL",
    },
  },
  uploadedAt: { type: Date, default: Date.now },
});

export default mongoose.model("UserPhotos", userPhotosSchema);
