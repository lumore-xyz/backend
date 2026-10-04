import mongoose from "mongoose";

const appOptionsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
    },
    options: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    version: {
      type: String,
      default: () => new Date().toISOString(),
      index: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

appOptionsSchema.path("options").validate(function validateOptionsShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.values(value).every((entry) => {
    if (!Array.isArray(entry)) return false;
    return entry.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.label === "string" &&
        typeof item.value === "string" &&
        (item.icon === undefined ||
          item.icon === null ||
          (item.icon &&
            typeof item.icon === "object" &&
            typeof item.icon.library === "string" &&
            typeof item.icon.name === "string")),
    );
  });
}, "options must be an object of option arrays with {label,value} items (icon optional)");

export default mongoose.model("AppOptions", appOptionsSchema);
