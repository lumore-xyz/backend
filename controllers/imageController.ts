import dotenv from "dotenv";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import UserPhotos from "../models/UserPhotos.js";
import { Request, Response } from "express";
import { FileWithLocation, RequestUser } from "../types/request.js";

dotenv.config();

const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
if (!AWS_S3_BUCKET_NAME)
  throw new Error("AWS_S3_BUCKET_NAME is not defined in environment variables");

// Configure Multer-S3 Storage
const upload = multer({
  storage: multerS3({
    s3: new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    }),
    bucket: AWS_S3_BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      if (!req.user) throw new Error("User not found");
      const { id } = req.user as { id: string };
      const fileName = `user-${id}/${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB file size limit
});

// Upload Image (Max 6 per user)
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as RequestUser;
    const { location: FILE_LOCATION } = req.file as unknown as FileWithLocation;
    const userPhotos = await UserPhotos.find({ user: userId });

    if (userPhotos.length >= 6) {
      return res.status(400).json({ message: "Maximum of 6 photos allowed" });
    }

    const newPhoto = new UserPhotos({
      user: userId,
      photoUrl: FILE_LOCATION, // S3 public URL
    });

    await newPhoto.save();
    res
      .status(201)
      .json({ message: "Image uploaded successfully", photo: newPhoto });
  } catch (error) {
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Error occurred uploading image",
    });
  }
};

// Delete Image from S3 and Database
export const deleteImage = async (req: Request, res: Response) => {
  try {
    const { photoId } = req.params;
    const { id: userId } = req.user as RequestUser;

    const photo = await UserPhotos.findOne({ _id: photoId, user: userId });
    if (!photo) return res.status(404).json({ message: "Photo not found" });

    // Extract S3 file key from URL
    const fileKey = photo.photoUrl?.split(".com/")[1];

    // Delete from S3
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: fileKey,
      })
    );

    // Delete from MongoDB
    await UserPhotos.findByIdAndDelete(photoId);

    res.status(200).json({ message: "Photo deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
};

// Export Multer Upload Middleware
export const uploadMiddleware = upload.single("image");
