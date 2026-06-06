// middleware/upload.js
import multer from "multer";

const storage = multer.memoryStorage();
export const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Only .jpeg, .jpg, .png, and .webp files are allowed"));
        }
        cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export const uploadAudio = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "audio/aac",
            "audio/mp4",
            "audio/mpeg",
            "audio/ogg",
            "audio/wav",
            "audio/webm",
            "audio/x-m4a",
            "audio/3gpp",
            "video/mp4",
            "video/webm",
        ];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Only audio files are allowed"));
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
});
