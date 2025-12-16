const mongoose = require("mongoose");
const User = require("../models/User");
const SubUser = require("../models/SubUser");
const jwt = require("jsonwebtoken");
const { sendOTP, sendForgotPasswordOTP } = require("../utils/email");
const { validationResult } = require("express-validator");
const multer = require("multer");
const path = require("path");

// In-memory storage for OTPs (in production, use Redis or database)
const otpStore = new Map();

// Simple in-memory rate limiter for admin login (per IP)
// Note: in production use Redis or a proper rate-limiter.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function recordLoginAttempt(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, first: now };
  if (now - entry.first > WINDOW_MS) {
    // reset window
    entry.count = 1;
    entry.first = now;
  } else {
    entry.count += 1;
  }
  loginAttempts.set(ip, entry);
  return entry;
}

function isRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  const now = Date.now();
  if (now - entry.first > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPHandler = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    // If user exists and is verified and not archived, block registration
    if (existingUser && existingUser.isVerified && !existingUser.archived) {
      return res.status(400).json({ message: "User already exists" });
    }

    // If user exists and is either unverified or archived, update password and reuse record
    if (existingUser) {
      existingUser.password = password;
      // don't unarchive yet; we'll unarchive on successful OTP verification
      await existingUser.save();
    } else {
      // Create new user
      const user = new User({
        username,
        email,
        password,
        isVerified: false,
      });
      await user.save();
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email, { otp, expiresAt, username });

    // Prefer to send email when configured, but don't fail registration flow if email sending fails.
    try {
      // try to send real email (requires EMAIL_USER/EMAIL_PASS env vars)
      await sendOTP(email, otp);
      console.log(`OTP sent to ${email}`);
    } catch (e) {
      // fallback: log OTP for local testing
      console.warn(
        `Failed to send OTP by email: ${e.message}. Falling back to console log.`
      );
      console.log(`OTP for ${email}: ${otp}`);
    }

    res.json({ message: "OTP sent (or logged) successfully" });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;

    const storedOTP = otpStore.get(email);
    if (!storedOTP) {
      return res.status(400).json({ message: "OTP not found or expired" });
    }

    if (Date.now() > storedOTP.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Find and verify user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    user.isVerified = true;
    // If the account was archived, unarchive it on successful verification
    if (user.archived) user.archived = false;
    await user.save();

    // Clean up OTP
    otpStore.delete(email);

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Allow login with either email or username
    const identifier = (email || "").toString().trim();
    const query = {
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    };
    let user = await User.findOne(query);

    // If no primary user found, attempt SubUser login
    if (!user) {
      const sub = await SubUser.findOne({ email: identifier.toLowerCase() });
      if (!sub) return res.status(400).json({ message: "Invalid credentials" });

      const match = await sub.comparePassword(password);
      if (!match)
        return res.status(400).json({ message: "Invalid credentials" });

      // Issue token that points to the main user's id but marks token as sub-user
      const token = jwt.sign(
        {
          userId: sub.mainUser.toString(),
          subUserId: sub._id.toString(),
          isSubUser: true,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        message: "Login successful (sub-user)",
        token,
        user: { id: sub.mainUser, subUserId: sub._id, isSubUser: true },
      });
    }

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin-only login (for dashboard) — similar to login but requires isAdmin
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = (
      req.headers["x-forwarded-for"] ||
      req.connection?.remoteAddress ||
      req.ip ||
      req.socket?.remoteAddress ||
      ""
    )
      .split(",")[0]
      .trim();
    if (isRateLimited(ip)) {
      return res
        .status(429)
        .json({ message: "Too many login attempts. Try again later." });
    }

    const identifier = (email || "").toString().trim();
    const query = {
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    };
    const user = await User.findOne(query);
    if (!user) {
      recordLoginAttempt(ip);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      recordLoginAttempt(ip);
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    if (!user.isAdmin) {
      recordLoginAttempt(ip);
      return res.status(403).json({ message: "Access denied: admin only" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      recordLoginAttempt(ip);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Successful login — clear attempts for this ip
    loginAttempts.delete(ip);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email, { otp, expiresAt, type: "forgotPassword" });

    try {
      await sendForgotPasswordOTP(email, otp);
      console.log(`Forgot password OTP sent to ${email}`);
    } catch (e) {
      console.warn(
        `Failed to send forgot-password OTP by email: ${e.message}. Falling back to console log.`
      );
      console.log(`Forgot password OTP for ${email}: ${otp}`);
    }

    res.json({
      message: "OTP sent (or logged) to your email for password reset",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp, newPassword } = req.body;

    const storedOTP = otpStore.get(email);
    if (!storedOTP || storedOTP.type !== "forgotPassword") {
      return res.status(400).json({ message: "OTP not found or expired" });
    }

    if (Date.now() > storedOTP.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    user.password = newPassword;
    await user.save();

    // Clean up OTP
    otpStore.delete(email);

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Profile CRUD functions
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Public profile: return the first user with a shopName or the first user
const getPublicProfile = async (req, res) => {
  try {
    // Prefer a user that has shopName and address filled
    let user = await User.findOne({
      shopName: { $exists: true, $ne: null, $ne: "" },
      address: { $exists: true, $ne: null, $ne: "" },
    }).select(
      "shopName address phoneNumber whatsappNumber image facebookId instagramId website username"
    );

    if (!user) {
      // fallback to any verified user
      user = await User.findOne({ isVerified: true }).select(
        "shopName address phoneNumber whatsappNumber image facebookId instagramId website username email"
      );
    }

    if (!user) {
      // final fallback: return any user in DB (helpful in dev when no verification step completed)
      user = await User.findOne().select(
        "shopName address phoneNumber whatsappNumber image facebookId instagramId website username email"
      );
    }

    if (!user) {
      return res.status(404).json({ message: "No public profile available" });
    }

    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Public profile by user id (for frontends that need a specific shop)
const getPublicProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "User id required" });

    const user = await User.findById(id).select(
      "shopName address phoneNumber whatsappNumber image facebookId instagramId website username email"
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      username,
      password,
      shopName,
      address,
      phoneNumber,
      whatsappNumber,
      currency,
      facebookId,
      instagramId,
      website,
    } = req.body;

    // Disallow sub-users from updating the main shop profile
    if (req.user && req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot update shop profile" });
    }

    // For admin settings, assume admin is logged in and get from token if available, else find admin
    let user;
    if (req.user && req.user.userId) {
      user = await User.findById(req.user.userId);
    } else {
      user = await User.findOne({ isAdmin: true });
    }
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields
    if (username) user.username = username;
    if (password) user.password = password;
    if (shopName !== undefined) user.shopName = shopName;
    if (address !== undefined) user.address = address;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (whatsappNumber !== undefined) user.whatsappNumber = whatsappNumber;
    if (currency !== undefined) user.currency = currency;
    if (facebookId !== undefined) user.facebookId = facebookId;
    if (instagramId !== undefined) user.instagramId = instagramId;
    if (website !== undefined) user.website = website;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: { ...user.toObject(), password: undefined },
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

const uploadImage = async (req, res) => {
  try {
    // Disallow sub-users from changing the shop image
    if (req.user && req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot upload shop image" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.image = req.file.path;
    await user.save();

    res.json({
      message: "Image uploaded successfully",
      imagePath: req.file.path,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Sub-user CRUD functions
const addSubUser = async (req, res) => {
  try {
    // Only main users (not sub-users) can add sub-users
    if (req.user && req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot add sub-users" });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { subUsername, email, password, phoneNumber } = req.body;

    const subUser = new SubUser({
      subUsername,
      email,
      password,
      phoneNumber,
      mainUser: req.user.userId,
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

const getSubUsers = async (req, res) => {
  try {
    const subUsers = await SubUser.find({ mainUser: req.user.userId }).select(
      "-password"
    );
    res.json({ subUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateSubUser = async (req, res) => {
  try {
    // Only main users (not sub-users) can update sub-users
    if (req.user && req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot update sub-users" });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    // guard against local temp ids or invalid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid sub-user id" });
    }
    const { subUsername, email, password, phoneNumber } = req.body;

    const subUser = await SubUser.findOne({
      _id: id,
      mainUser: req.user.userId,
    });
    if (!subUser) {
      return res.status(404).json({ message: "Sub-user not found" });
    }

    if (subUsername) subUser.subUsername = subUsername;
    if (email) subUser.email = email;
    if (password) subUser.password = password;
    if (phoneNumber) subUser.phoneNumber = phoneNumber;

    await subUser.save();

    res.json({
      message: "Sub-user updated successfully",
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

const deleteSubUser = async (req, res) => {
  try {
    // Only main users (not sub-users) can delete sub-users
    if (req.user && req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot delete sub-users" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid sub-user id" });
    }

    const subUser = await SubUser.findOneAndDelete({
      _id: id,
      mainUser: req.user.userId,
    });
    if (!subUser) {
      return res.status(404).json({ message: "Sub-user not found" });
    }

    res.json({ message: "Sub-user deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get total counts for users and sub-users
const getCounts = async (req, res) => {
  try {
    // Count all users and sub-users
    const totalUsers = await User.countDocuments();
    const totalSubUsers = await SubUser.countDocuments();

    // Count users with filled shop profiles (at least shopName and address)
    const activeShops = await User.countDocuments({
      shopName: { $exists: true, $ne: null, $ne: "" },
      address: { $exists: true, $ne: null, $ne: "" },
    });

    res.json({ totalUsers, totalSubUsers, activeShops });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// One-time setup endpoint: create initial admin if none exists
const createInitialAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: "username, email and password are required" });
    }

    // If any admin exists, disallow creating another via this endpoint
    const existingAdmin = await User.findOne({ isAdmin: true });
    if (existingAdmin) {
      return res.status(403).json({ message: "Admin already exists" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });

    const user = new User({
      username,
      email,
      password,
      isVerified: true,
      isAdmin: true,
    });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "Admin user created",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000)
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: create a new user directly (no OTP) and optionally set isAdmin
const adminCreateUser = async (req, res) => {
  try {
    const { username, email, password, isAdmin } = req.body;
    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: "username, email and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const user = new User({
      username,
      email,
      password,
      isVerified: true,
      isAdmin: !!isAdmin,
    });
    await user.save();

    res.status(201).json({
      message: "User created",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000)
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: update an existing user (username/email/password/isAdmin)
const adminUpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const { username, email, password, isAdmin } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (username) user.username = username;
    if (email) user.email = email;
    if (password) user.password = password;
    if (typeof isAdmin !== "undefined") user.isAdmin = !!isAdmin;

    await user.save();

    res.json({
      message: "User updated",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000)
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: list all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: delete a user by id
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Optionally, remove sub-users belonging to this user
    await SubUser.deleteMany({ mainUser: id });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Self-archive profile (soft-delete) — user remains in DB and can be restored by re-registering
const deleteProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // mark archived so data remains; prevent immediate reuse until re-register flow
    user.archived = true;
    // optionally mark unverified
    user.isVerified = false;
    await user.save();

    res.json({
      message: "Account archived. Re-register with same email to restore.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  sendOTPHandler,
  verifyOTP,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  // public profile for homepage (no auth)
  getPublicProfile,
  // public profile by id
  getPublicProfileById,
  updateProfile,
  uploadImage,
  upload,
  addSubUser,
  getSubUsers,
  updateSubUser,
  deleteSubUser,
  getCounts,
  createInitialAdmin,
  adminLogin,
  adminCreateUser,
  adminUpdateUser,
  getAllUsers,
  deleteUser,
  deleteProfile,
};
