import dotenv from "dotenv";
import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../config/aws.js"; // Import AWS S3 config
import UserPhotos from "../models/UserPhotos.js";

dotenv.config();

// Configure Multer-S3 Storage
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const fileName = `user-${req.user.id}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB file size limit
});

// Upload Image (Max 6 per user)
export const uploadImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const userPhotos = await UserPhotos.find({ user: userId });

    if (userPhotos.length >= 6) {
      return res.status(400).json({ message: "Maximum of 6 photos allowed" });
    }

    const newPhoto = new UserPhotos({
      user: userId,
      photoUrl: req.file.location, // S3 public URL
    });

    await newPhoto.save();
    res
      .status(201)
      .json({ message: "Image uploaded successfully", photo: newPhoto });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Image from S3 and Database
export const deleteImage = async (req, res) => {
  try {
    const { photoId } = req.params;
    const userId = req.user.id;

    const photo = await UserPhotos.findOne({ _id: photoId, user: userId });
    if (!photo) return res.status(404).json({ message: "Photo not found" });

    // Extract S3 file key from URL
    const fileKey = photo.photoUrl.split(".com/")[1];

    // Delete from S3
    await s3
      .deleteObject({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileKey,
      })
      .promise();

    // Delete from MongoDB
    await UserPhotos.findByIdAndDelete(photoId);

    res.status(200).json({ message: "Photo deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export Multer Upload Middleware
export const uploadMiddleware = upload.single("image");
