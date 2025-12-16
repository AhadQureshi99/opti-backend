#!/usr/bin/env node
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const User = require("../models/User");
const Order = require("../models/Order");
const Expense = require("../models/Expense");

async function main() {
  if (!process.env.MONGO_URL) {
    console.error("MONGO_URL not found in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("Connected to MongoDB");

  // Get FIRST non-admin user
  const user = await User.findOne({ isAdmin: { $ne: true } });

  if (!user) {
    console.error("No users found!");
    process.exit(1);
  }

  console.log(`Creating test data for user: ${user.email}`);
  const userId = user._id;

  // Delete existing data for this user first
  await Order.deleteMany({ user: userId });
  await Expense.deleteMany({ user: userId });
  console.log("Cleared existing data");

  // Create 10 sample orders
  let orderCount = 0;
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    const deliveryDate = new Date(date);
    deliveryDate.setDate(deliveryDate.getDate() + 7);

    const totalAmount = Math.floor(Math.random() * 500) + 100;
    const advance = Math.floor(totalAmount * 0.3);
    const balance = totalAmount - advance;

    try {
      const order = new Order({
        user: userId,
        patientName: `Patient ${i + 1}`,
        whatsappNumber: `555${String(1000 + i).slice(0, 3)}`,
        frameDetails: `Frame Type ${
          i % 3 === 0 ? "Metal" : i % 3 === 1 ? "Plastic" : "Combination"
        }`,
        lensType: `Lens ${i % 2 === 0 ? "Single Vision" : "Progressive"}`,
        totalAmount,
        advance,
        balance,
        deliveryDate,
        status: i % 3 === 0 ? "completed" : "pending",
        trackingId: `TRK-${Date.now()}-${i}`,
        rightEye: { sph: -1.5, cyl: -0.5, axis: 90 },
        leftEye: { sph: -1.75, cyl: -0.75, axis: 85 },
      });
      await order.save();
      orderCount++;
    } catch (err) {
      console.log(`  Order ${i} error:`, err.message);
    }
  }
  console.log(`Created ${orderCount} orders`);

  // Create 10 sample expenses
  const categories = [
    "Salary",
    "Frame Vendors",
    "Lens Vendor",
    "Box Vendor",
    "Marketing",
    "Accessories",
    "Repair and Maintenance",
    "New Asset Purchase",
  ];

  let expenseCount = 0;
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(10 + i, 0, 0, 0); // Set different times to avoid conflicts

    try {
      const expense = new Expense({
        user: userId,
        amount: Math.floor(Math.random() * 1000) + 50,
        category: categories[Math.floor(Math.random() * categories.length)],
        date: new Date(date), // Ensure fresh date
        description: `Expense ${i + 1}`,
      });
      await expense.save();
      expenseCount++;
    } catch (err) {
      console.log(`  Expense ${i} error:`, err.message);
      if (err.keyValue) console.log("  Duplicate key:", err.keyValue);
    }
  }
  console.log(`Created ${expenseCount} expenses`);

  console.log("\n==== TEST DATA CREATED ====");
  console.log("User Email:", user.email);
  console.log("User ID:", user._id);
  console.log("Orders:", orderCount);
  console.log("Expenses:", expenseCount);
  console.log("===========================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating test data:", err);
  process.exit(1);
});
