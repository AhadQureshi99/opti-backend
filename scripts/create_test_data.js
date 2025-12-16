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

  // Get user email from command line argument or use default
  const userEmail = process.argv[2] || "test@example.com";
  console.log(`Creating test data for user: ${userEmail}`);

  // Find user by email or create one
  let user = await User.findOne({ email: userEmail });

  if (!user) {
    user = new User({
      username: userEmail.split("@")[0],
      email: userEmail,
      password: "test123",
      isVerified: true,
      isAdmin: false,
      shopName: "Test Shop",
      address: "123 Test Street, Test City",
      phoneNumber: "5551234567",
      whatsappNumber: "5551234567",
    });
    await user.save();
    console.log("Created new user:", user.email);
  }

  console.log("Using user:", user.email, "ID:", user._id);
  const userId = user._id;

  // Create 10 sample orders
  const orders = [];
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    const deliveryDate = new Date(date);
    deliveryDate.setDate(deliveryDate.getDate() + 7);

    const totalAmount = Math.floor(Math.random() * 500) + 100;
    const advance = Math.floor(totalAmount * 0.3);
    const balance = totalAmount - advance;

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
    orders.push(order);
  }
  console.log(`Created ${orders.length} sample orders`);

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

  const expenses = [];
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    const expense = new Expense({
      user: userId,
      amount: Math.floor(Math.random() * 1000) + 50,
      category: categories[Math.floor(Math.random() * categories.length)],
      date: date,
      description: `Expense ${i + 1}`,
    });
    await expense.save();
    expenses.push(expense);
  }
  console.log(`Created ${expenses.length} sample expenses`);

  console.log("\n==== TEST DATA CREATED ====");
  console.log("User Email:", user.email);
  console.log("User ID:", user._id);
  console.log("Orders:", orders.length);
  console.log("Expenses:", expenses.length);
  console.log("===========================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating test data:", err);
  process.exit(1);
});
