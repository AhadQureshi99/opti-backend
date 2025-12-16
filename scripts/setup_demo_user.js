#!/usr/bin/env node
/**
 * This script creates a verified user with test data (orders and expenses)
 * It ensures proper password hashing and verification status
 */
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

  // Get user email from command line or use default
  const userEmail = process.argv[2] || "demo@example.com";
  const password = process.argv[3] || "demo123";
  const username = userEmail.split("@")[0] + "_demo";

  console.log(`\nCreating verified user: ${userEmail}`);

  // Delete existing user if present (to reset)
  const existingUser = await User.findOne({ email: userEmail });
  if (existingUser) {
    console.log("Found existing user, deleting...");
    await User.deleteOne({ _id: existingUser._id });
    await Order.deleteMany({ user: existingUser._id });
    await Expense.deleteMany({ user: existingUser._id });
  }

  // Create new user with proper verification status
  const newUser = new User({
    username,
    email: userEmail,
    password, // Will be hashed by pre-save hook
    isVerified: true, // Mark as verified so login works
    isAdmin: false,
    shopName: "Demo Shop",
    address: "123 Demo Street",
    phoneNumber: "5551234567",
    whatsappNumber: "5551234567",
  });

  try {
    await newUser.save();
    console.log("✓ User created successfully");
    console.log(`  Email: ${userEmail}`);
    console.log(`  Password: ${password}`);
  } catch (err) {
    if (err.code === 11000) {
      console.error("✗ Error: Username or email already exists");
      const conflictKey = Object.keys(err.keyPattern)[0];
      console.log(`  Conflict field: ${conflictKey}`);
    } else {
      console.error("✗ Error creating user:", err.message);
    }
    process.exit(1);
  }

  const userId = newUser._id;

  // Clear existing data for this user
  await Order.deleteMany({ user: userId });
  await Expense.deleteMany({ user: userId });
  console.log("✓ Cleared existing orders/expenses");

  // Create 10 sample orders (8 completed, 2 pending for testing)
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
          ["Metal", "Plastic", "Combination"][i % 3]
        }`,
        lensType: `${["Single Vision", "Progressive"][i % 2]}`,
        totalAmount,
        advance,
        balance,
        deliveryDate,
        status: i < 8 ? "completed" : "pending", // 8 completed, 2 pending
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
  console.log(`✓ Created ${orderCount} sample orders (8 completed, 2 pending)`);

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
    date.setHours(10 + i, 0, 0, 0);

    try {
      const expense = new Expense({
        user: userId,
        amount: Math.floor(Math.random() * 1000) + 50,
        category: categories[Math.floor(Math.random() * categories.length)],
        date: new Date(date),
        description: `Expense ${i + 1}`,
      });
      await expense.save();
      expenseCount++;
    } catch (err) {
      console.log(`  Expense ${i} error:`, err.message);
    }
  }
  console.log(`✓ Created ${expenseCount} sample expenses`);

  console.log("\n========== LOGIN CREDENTIALS ==========");
  console.log(`Email:    ${userEmail}`);
  console.log(`Password: ${password}`);
  console.log("=======================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
