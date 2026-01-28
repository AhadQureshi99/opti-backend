const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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

pendingUserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

pendingUserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("PendingUser", pendingUserSchema);
