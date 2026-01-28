const mongoose = require("mongoose");

const pendingUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending_verification"],
      default: "pending_verification",
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }, // Auto-delete after expiration
    },
  },
  { timestamps: true },
);

// Do NOT hash password in PendingUser - it's just temporary storage
// Password will be hashed by User model when OTP is verified

module.exports = mongoose.model("PendingUser", pendingUserSchema);
