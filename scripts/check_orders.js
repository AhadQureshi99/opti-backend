#!/usr/bin/env node
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const user = await User.findOne({ email: "demo@example.com" });
  if (!user) {
    console.log("User not found");
    process.exit(1);
  }

  const orders = await Order.find({ user: user._id });
  console.log("Total orders:", orders.length);
  console.log(
    "Completed orders:",
    orders.filter((o) => o.status === "completed").length
  );
  console.log(
    "Pending orders:",
    orders.filter((o) => o.status === "pending").length
  );

  orders.forEach((o) => {
    console.log(`  - ${o.patientName}: ${o.status} - ₹${o.totalAmount}`);
  });

  process.exit(0);
})();
