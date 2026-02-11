import cloudinary from "../utils/cloudinary.js";

type ResourceType = "raw" | "auto" | "image" | "video";

type UploadResult = {
  secure_url: string;
  public_id: string;
  [key: string]: any;
};

type OptimizeOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: string;
};

type UploadImageOptions = OptimizeOptions & {
  buffer: Buffer;
  folder?: string;
  publicId?: string;
  resourceType?: ResourceType;
  transformation?: any;
  optimize?: boolean;
};

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
  buffer: Buffer,
  {
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality = 80,
    format = "webp",
  }: OptimizeOptions = {},
) => {
  const sharp = await getSharp();
  if (!sharp) return { buffer, optimized: false };

  // @ts-ignore
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
}: UploadImageOptions) => {
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

  return new Promise<UploadResult>((resolve, reject) => {
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
        return resolve(result);
      },
    );

    stream.end(uploadBuffer);
  });
};

export const deleteFile = async (
  publicId: string,
  resourceType: ResourceType = "image"
) => {
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
