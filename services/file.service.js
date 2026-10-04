import cloudinary from "../config/cloudinary.js";
import sharp from "sharp";

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_MAX_HEIGHT = 1200;

const uploadToCloudinary = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });

const optimizeImageBuffer = async (
  buffer,
  { maxWidth = DEFAULT_MAX_WIDTH, maxHeight = DEFAULT_MAX_HEIGHT } = {},
) =>
  sharp(buffer)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFormat("webp", { quality: 80 })
    .toBuffer();

export const uploadImage = async ({
  buffer,
  folder,
  publicId,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
} = {}) => {
  if (!buffer) throw new Error("Missing file buffer");

  const uploadBuffer = await optimizeImageBuffer(buffer, {
    maxWidth,
    maxHeight,
  });

  return uploadToCloudinary(uploadBuffer, {
    resource_type: "image",
    folder,
    public_id: publicId,
    format: "webp",
    transformation: [
      { fetch_format: "auto" },
      { quality: "auto" },
      { crop: "limit", width: maxWidth, height: maxHeight },
    ],
  });
};

export const deleteFile = async (publicId, resourceType = "image") => {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
};

export const uploadAudio = async ({ buffer, folder, publicId } = {}) => {
  if (!buffer) throw new Error("Missing file buffer");

  return uploadToCloudinary(buffer, {
    resource_type: "video",
    folder,
    public_id: publicId,
  });
};

export const extractPublicIdFromUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const uploadIndex = parsed.pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    const pathSegments = parsed.pathname
      .slice(uploadIndex + "/upload/".length)
      .split("/")
      .filter(Boolean);
    const versionIndex = pathSegments.findIndex((segment) => /^v\d+$/.test(segment));
    if (versionIndex !== -1) pathSegments.splice(0, versionIndex + 1);
    let publicId = pathSegments.join("/");
    publicId = publicId.replace(/\.[^/.]+$/, "");
    return publicId || null;
  } catch {
    return null;
  }
};
