import cloudinary from "../utils/cloudinary.js";

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_MAX_HEIGHT = 1200;

const getSharp = async () => {
  try {
    const mod = await import("sharp");
    return mod.default ?? mod;
  } catch (error) {
    return null;
  }
};

export const optimizeImageBuffer = async (
  buffer,
  {
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = 80,
    format = "webp",
  } = {},
) => {
  const sharp = await getSharp();
  if (!sharp) return { buffer, optimized: false };

  const optimizedBuffer = await sharp(buffer)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFormat(format, { quality })
    .toBuffer();

  return { buffer: optimizedBuffer, optimized: true };
};

export const uploadImage = async ({
  buffer,
  folder,
  publicId,
  resourceType = "image",
  format = "webp",
  transformation,
  optimize = true,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
  quality = 80,
} = {}) => {
  if (!buffer) throw new Error("Missing file buffer");

  const { buffer: uploadBuffer } = optimize
    ? await optimizeImageBuffer(buffer, {
        maxWidth,
        maxHeight,
        quality,
        format,
      })
    : { buffer };

  const defaultTransform = [
    { fetch_format: "auto" },
    { quality: "auto" },
    { crop: "limit", width: maxWidth, height: maxHeight },
  ];

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder,
        public_id: publicId,
        format,
        transformation: transformation ?? defaultTransform,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );

    stream.end(uploadBuffer);
  });
};

export const deleteFile = async (publicId, resourceType = "image") => {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
};

export const extractPublicIdFromUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const uploadIndex = parsed.pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    let publicId = parsed.pathname.slice(uploadIndex + "/upload/".length);
    publicId = publicId.replace(/^v\d+\//, "");
    publicId = publicId.replace(/\.[^/.]+$/, "");
    return publicId || null;
  } catch {
    return null;
  }
};
