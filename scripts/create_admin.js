#!/usr/bin/env node
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const email = "ahadqurehshi16756@gmail.com";
const password = "ahad123";
const username = "ahad";

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

  // If an admin already exists, abort
  const existingAdmin = await User.findOne({ isAdmin: true });
  if (existingAdmin) {
    console.log("An admin already exists:", existingAdmin.email);
    process.exit(0);
  }

  // If user exists with this email, upgrade them to admin
  let user = await User.findOne({ email });
  if (user) {
    user.password = password; // will be hashed by model pre-save
    user.isVerified = true;
    user.isAdmin = true;
    await user.save();
    console.log("Upgraded existing user to admin:", user.email);
  } else {
    user = new User({
      username,
      email,
      password,
      isVerified: true,
      isAdmin: true,
    });
    await user.save();
    console.log("Created new admin:", user.email);
  }

  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "7d" }
  );
  console.log("\n==== ADMIN CREDENTIALS ====");
  console.log("email:", user.email);
  console.log("username:", user.username);
  console.log("password:", password);
  console.log("JWT:", token);
  console.log("===========================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating admin:", err);
  process.exit(1);
});
