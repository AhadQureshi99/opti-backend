const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Food",
        "Transport",
        "Entertainment",
        "Shopping",
        "Utilities",
        "Healthcare",
        "Education",
        "Other",
      ],
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
