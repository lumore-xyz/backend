import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import sharp from "sharp";

const NSFW_EXPLICIT_SUM_THRESHOLD = Number(
  process.env.NSFW_EXPLICIT_SUM_THRESHOLD || 0.7,
);
const NSFW_SINGLE_EXPLICIT_THRESHOLD = Number(
  process.env.NSFW_SINGLE_EXPLICIT_THRESHOLD || 0.5,
);
const NSFW_SEXY_HARD_THRESHOLD = Number(
  process.env.NSFW_SEXY_HARD_THRESHOLD || 0.98,
);
const NSFW_NEUTRAL_SOFT_ALLOW_THRESHOLD = Number(
  process.env.NSFW_NEUTRAL_SOFT_ALLOW_THRESHOLD || 0.2,
);
const NSFW_MODEL_INPUT_SIZE = Number(process.env.NSFW_MODEL_INPUT_SIZE || 299);

let modelPromise = null;

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveLocalModelPath = () => {
  const explicitPath = process.env.NSFW_MODEL_PATH;
  if (explicitPath && fs.existsSync(explicitPath)) {
    return path.resolve(explicitPath);
  }

  const candidates = [
    path.resolve(process.cwd(), "nsfw_model/model.json"),
    path.resolve(process.cwd(), "public/nsfw_model/model.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const getModel = async () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      let tf = null;
      let useNodeBinding = false;
      try {
        tf = await import("@tensorflow/tfjs-node");
        useNodeBinding = true;
      } catch (error) {
        // Fallback when native tfjs-node binary is unavailable (common on Windows setups).
        tf = await import("@tensorflow/tfjs");
      }

      if (typeof tf?.ready === "function") {
        await tf.ready();
      }

      const nsfwjs = await import("nsfwjs");
      const loadModel = nsfwjs?.load || nsfwjs?.default?.load;
      if (typeof loadModel !== "function") {
        throw new Error("NSFW model loader unavailable");
      }

      const localModelPath = resolveLocalModelPath();
      const port = process.env.PORT || 5000;
      const explicitUrl = process.env.NSFW_MODEL_URL;

      let modelSource;
      if (localModelPath) {
        modelSource = useNodeBinding
          ? pathToFileURL(localModelPath).href
          : process.env.NSFW_MODEL_LOCAL_URL ||
            `http://127.0.0.1:${port}/nsfw_model/model.json`;
      } else if (isHttpUrl(explicitUrl)) {
        modelSource = explicitUrl;
      }

      const model = modelSource
        ? await loadModel(modelSource, { size: NSFW_MODEL_INPUT_SIZE })
        : await loadModel(undefined, { size: NSFW_MODEL_INPUT_SIZE });

      return { tf, model, useNodeBinding };
    })();
  }

  return modelPromise;
};

const decodeImageWithSharp = async (buffer, tf) => {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
};

export const analyzeImageBuffer = async (buffer) => {
  if (!buffer) throw new Error("Missing image buffer for NSFW analysis");

  const { tf, model, useNodeBinding } = await getModel();

  const decoded = useNodeBinding
    ? tf.node.decodeImage(buffer, 3)
    : await decodeImageWithSharp(buffer, tf);
  try {
    const predictions = await model.classify(decoded);
    return predictions;
  } finally {
    decoded.dispose();
  }
};

export const isSafeImageBuffer = async (buffer) => {
  const predictions = await analyzeImageBuffer(buffer);
  const scoreByClass = predictions.reduce((acc, item) => {
    acc[String(item.className || "").toLowerCase()] = Number(
      item.probability || 0,
    );
    return acc;
  }, {});

  const pornScore = scoreByClass.porn || 0;
  const hentaiScore = scoreByClass.hentai || 0;
  const sexyScore = scoreByClass.sexy || 0;
  const neutralScore = scoreByClass.neutral || 0;
  const drawingScore = scoreByClass.drawing || 0;
  const explicitScore = pornScore + hentaiScore;

  const blockedByExplicit =
    explicitScore >= NSFW_EXPLICIT_SUM_THRESHOLD ||
    pornScore >= NSFW_SINGLE_EXPLICIT_THRESHOLD ||
    hentaiScore >= NSFW_SINGLE_EXPLICIT_THRESHOLD;

  const blockedByExtremeSexy =
    sexyScore >= NSFW_SEXY_HARD_THRESHOLD &&
    neutralScore < NSFW_NEUTRAL_SOFT_ALLOW_THRESHOLD &&
    drawingScore < NSFW_NEUTRAL_SOFT_ALLOW_THRESHOLD;

  const safe = !(blockedByExplicit || blockedByExtremeSexy);
  return {
    safe,
    predictions,
    reason: safe
      ? null
      : "Image blocked by safety policy. Please choose a non-explicit image.",
  };
};
