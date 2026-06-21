import mongoose from "mongoose";

import {
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
} from "../libs/notificationConstants.js";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    entityType: {
      type: String,
      enum: NOTIFICATION_ENTITY_TYPES,
      default: null,
      index: true,
    },
    entityId: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Idempotency guard: the same logical event (e.g. a match between two users)
// always maps to the same (userId, type, entityType, entityId) tuple. The
// unique partial index makes a retry-safe upsert possible and keeps the
// collection from growing without bound when consumers re-fire events.
notificationSchema.index(
  {
    userId: 1,
    type: 1,
    entityType: 1,
    entityId: 1,
  },
  {
    unique: true,
    name: "notification_idempotency_idx",
    partialFilterExpression: {
      entityType: { $exists: true },
      entityId: { $exists: true },
    },
  },
);

notificationSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id?.toString?.() || ret.id;
    delete ret._id;
    return ret;
  },
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
