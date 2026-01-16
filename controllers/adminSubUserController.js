const SubUser = require("../models/SubUser");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

// Get sub-users for a specific user by admin
const getSubUsersForUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const subUsers = await SubUser.find({ mainUser: id }).select("-password");
    res.json({ subUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add sub-user for a specific user by admin
const addSubUserForUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const { subUsername, email, password, phoneNumber } = req.body;

    const subUser = new SubUser({
      subUsername,
      email,
      password,
      phoneNumber,
      mainUser: id,
    });

    await subUser.save();

    res.status(201).json({
      message: "Sub-user added successfully",
      subUser: { ...subUser.toObject(), password: undefined },
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: Delete any sub-user by ID
const adminDeleteSubUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid sub-user id" });
    }
    const subUser = await SubUser.findByIdAndDelete(id);
    if (!subUser) {
      return res.status(404).json({ message: "Sub-user not found" });
    }
    res.json({ message: "Sub-user deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getSubUsersForUser,
  addSubUserForUser,
  adminDeleteSubUser,
};
