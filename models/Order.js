const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: true,
    },
    whatsappNumber: {
      type: String,
      required: true,
    },
    frameDetails: {
      type: String,
    },
    lensType: {
      type: String,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    advance: {
      type: Number,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
    deliveryDate: {
      type: Date,
      required: true,
    },
    rightEye: {
      sph: { type: Number },
      cyl: { type: Number },
      axis: { type: Number },
    },
    leftEye: {
      sph: { type: Number },
      cyl: { type: Number },
      axis: { type: Number },
    },
    addInput: {
      type: String,
    },
    importantNote: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    archived: {
      type: Boolean,
      default: false,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
