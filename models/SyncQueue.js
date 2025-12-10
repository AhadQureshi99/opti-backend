const mongoose = require("mongoose");

const syncQueueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    endpoint: {
      type: String,
      required: true, // /api/expenses, /api/orders, etc.
    },
    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed, // Stores the request body
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    error: {
      type: String,
      default: null,
    },
    responseData: {
      type: mongoose.Schema.Types.Mixed, // Stores response from processing
      default: null,
    },
    deviceId: {
      type: String, // Unique device identifier for conflict resolution
      default: null,
    },
    priority: {
      type: Number,
      default: 0, // Higher priority syncs first
    },
    retryAt: {
      type: Date, // Next retry time for exponential backoff
      default: null,
    },
  },
  { timestamps: true }
);

// Index for querying pending syncs by user
syncQueueSchema.index({ userId: 1, status: 1, createdAt: -1 });
syncQueueSchema.index({ status: 1, retryAt: 1 }); // For bulk processing
syncQueueSchema.index({ userId: 1, endpoint: 1 }); // For conflict detection

module.exports = mongoose.model("SyncQueue", syncQueueSchema);
