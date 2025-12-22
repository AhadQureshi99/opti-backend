const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    shopName: { type: String, trim: true },
    address: { type: String, trim: true },
    countryCode: { type: String, trim: true, default: "+1" },
    phoneNumber: { type: String, trim: true },
    whatsappCode: { type: String, trim: true, default: "+1" },
    whatsappNumber: { type: String, trim: true },
    image: { type: String },
    currency: { type: String, trim: true },
    facebookId: { type: String, trim: true },
    instagramId: { type: String, trim: true },
    website: { type: String, trim: true },
    archived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
