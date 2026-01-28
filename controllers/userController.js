const mongoose = require("mongoose");
const User = require("../models/User");
const PendingUser = require("../models/PendingUser");
const SubUser = require("../models/SubUser");
const Order = require("../models/Order");
const jwt = require("jsonwebtoken");
const { sendOTP, sendForgotPasswordOTP } = require("../utils/email");
const { validationResult } = require("express-validator");
const multer = require("multer");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// In-memory OTP store
const otpStore = new Map();

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Google OAuth login handler
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Google token is required" });
    }

    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;

    if (!email) {
      return res
        .status(400)
        .json({ message: "Unable to get email from Google" });
    }

    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });

    // If the existing account was archived, block Google login with a clear message
    if (user && user.archived) {
      return res.status(403).json({
        message: "Shop deactivated. Contact admin to reactivate your account.",
      });
    }

    if (!user) {
      // Create new user with Google info - set a flag to indicate no password set
      const tempPassword =
        Math.random().toString(36).slice(-8) +
        Math.random().toString(36).slice(-8);
      user = new User({
        email: email.toLowerCase(),
        username: payload.name || email.split("@")[0],
        password: tempPassword, // Temporary password (will be hashed)
        shopName: payload.name || email.split("@")[0],
        isVerified: true, // Google verified
        googleId: payload.sub,
        hasSetPassword: false, // Flag to indicate user needs to set password
      });
      await user.save();
    } else {
      // Keep Google linkage fresh for returning users
      if (!user.googleId || !user.hasSetPassword) {
        user.googleId = payload.sub;
      }
      // Backfill missing display fields from Google payload when available
      if (!user.username && payload.name) {
        user.username = payload.name;
      }
      if (!user.shopName && payload.name) {
        user.shopName = payload.name;
      }
      await user.save();
    }

    // Generate JWT token
    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        shopName: user.shopName,
        verified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(400).json({ message: "Google authentication failed" });
  }
};

// Sub-user login handler
const subUserLogin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const identifier = (email || "").toString().trim();
    const query = {
      $or: [{ email: identifier.toLowerCase() }, { subUsername: identifier }],
    };
    let subUser = await SubUser.findOne(query);
    if (!subUser)
      return res.status(400).json({ message: "Invalid credentials" });

    // Check if parent user is archived
    const parentUser = await User.findById(subUser.mainUser);
    if (parentUser && parentUser.archived) {
      return res.status(403).json({
        message:
          "This account has been deactivated. Contact the main account holder.",
      });
    }

    const isMatch = await subUser.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { subUserId: subUser._id, isSubUser: true, mainUser: subUser.mainUser },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      message: "Sub-user login successful",
      token,
      subUser: {
        id: subUser._id,
        subUsername: subUser.subUsername,
        email: subUser.email,
        mainUser: subUser.mainUser,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Check if email is already registered (for real-time validation)
const checkEmailAvailability = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Block any existing active (non-archived) account regardless of verification
    if (user && !user.archived) {
      return res.json({
        available: false,
        message: "Email already registered",
      });
    }

    return res.json({
      available: true,
      message: "Email is available",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const sendOTPHandler = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, username, password } = req.body;

    // Normalize email to lowercase for consistent checking
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already registered as an active user
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // If the account exists and is not archived, block signup
      if (!user.archived) {
        return res.status(400).json({
          message: "Email already registered. Please login instead.",
        });
      }
    }

    // Save to PendingUser instead of User
    // Delete any existing pending user with same email first
    await PendingUser.deleteOne({ email: normalizedEmail });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const pendingUser = new PendingUser({
      username,
      email: normalizedEmail,
      password,
      expiresAt,
    });
    await pendingUser.save();

    const otp = generateOTP();
    const otpExpiresAt = Date.now() + 10 * 60 * 1000;

    otpStore.set(normalizedEmail, { otp, expiresAt: otpExpiresAt, username });

    try {
      await sendOTP(normalizedEmail, otp);
      console.log(`OTP sent to ${normalizedEmail}`);
    } catch (e) {
      console.warn(`Failed to send OTP: ${e.message}. Logging OTP instead.`);
      console.log(`OTP for ${normalizedEmail}: ${otp}`);
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
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, otp } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const storedOTP = otpStore.get(normalizedEmail);
    if (!storedOTP)
      return res.status(400).json({ message: "OTP not found or expired" });

    if (Date.now() > storedOTP.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (storedOTP.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    // Get the pending user
    const pendingUser = await PendingUser.findOne({ email: normalizedEmail });
    if (!pendingUser)
      return res.status(400).json({ message: "Pending user not found" });

    // Check if there's an archived account with same email
    let user = await User.findOne({ email: normalizedEmail });

    if (user && user.archived) {
      // Restore archived account
      user.password = pendingUser.password;
      user.username = pendingUser.username;
      user.isVerified = true;
      user.archived = false;
      await user.save();
      console.log(`Restored archived account for ${normalizedEmail}`);
    } else if (!user) {
      // Create new verified user
      user = new User({
        username: pendingUser.username,
        email: normalizedEmail,
        password: pendingUser.password,
        isVerified: true,
      });
      await user.save();
    } else {
      // User exists and is not archived, this shouldn't happen
      return res.status(400).json({
        message: "Email already registered. Please login instead.",
      });
    }

    // Delete the pending user
    await PendingUser.deleteOne({ email: normalizedEmail });

    // Clear OTP
    otpStore.delete(normalizedEmail);

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.status(201).json({
      message: "Email verified successfully! Your account is now active.",
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
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    const identifier = (email || "").toString().trim();
    const query = {
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    };
    let user = await User.findOne(query);
    let isSubUser = false;

    if (!user) {
      // Check if it's a sub-user
      user = await SubUser.findOne({
        $or: [{ email: identifier.toLowerCase() }, { subUsername: identifier }],
      });
      if (user) {
        isSubUser = true;
      } else {
        return res.status(400).json({ message: "Invalid credentials" });
      }
    }

    // BLOCK ARCHIVED ACCOUNTS
    if (user.archived) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact admin.",
      });
    }

    if (!isSubUser && !user.isVerified) {
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    let token;
    let userData;
    if (isSubUser) {
      token = jwt.sign(
        { subUserId: user._id, isSubUser: true, mainUser: user.mainUser },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );
      userData = {
        id: user._id,
        subUsername: user.subUsername,
        email: user.email,
        isSubUser: true,
        mainUser: user.mainUser,
      };
    } else {
      // BLOCK ARCHIVED ACCOUNTS
      if (user.archived) {
        return res.status(403).json({
          message:
            "This account has been deleted. Please register again to restore your data.",
        });
      }

      if (!user.isVerified) {
        return res
          .status(400)
          .json({ message: "Please verify your email first" });
      }

      token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
      userData = {
        id: user._id,
        username: user.username,
        email: user.email,
      };
    }

    res.json({
      message: "Login successful",
      token,
      user: userData,
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

    const identifier = (email || "").toString().trim();
    const query = {
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    };
    const user = await User.findOne(query);
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.archived) {
      return res.status(403).json({
        message: "Shop deactivated. Contact admin.",
      });
    }

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ message: "Access denied: admin only" });
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

    // Check if user exists
    if (!user) {
      return res.status(400).json({
        message: "You need to register your email first",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(400).json({
        message: "Please verify your email first",
      });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email, { otp, expiresAt, type: "forgotPassword" });

    try {
      await sendForgotPasswordOTP(email, otp);
      console.log(`Forgot password OTP sent to ${email}`);
    } catch (e) {
      console.warn(
        `Failed to send forgot-password OTP by email: ${e.message}. Falling back to console log.`,
      );
      console.log(`Forgot password OTP for ${email}: ${otp}`);
    }

    res.json({
      message: "OTP sent to your email for password reset",
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
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
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
    let userId = req.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.userId);
      if (!subUser) {
        return res.status(404).json({ message: "Sub-user not found" });
      }
      userId = subUser.mainUser;
    }
    const user = await User.findById(userId).select(
      "username email shopName address countryCode phoneNumber whatsappCode whatsappNumber currency image facebookId instagramId website isAdmin",
    );
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
      "shopName address countryCode phoneNumber whatsappCode whatsappNumber image facebookId instagramId website currency",
    );

    if (!user) {
      // fallback to any verified user
      user = await User.findOne({ isVerified: true }).select(
        "shopName address countryCode phoneNumber whatsappCode whatsappNumber image facebookId instagramId website currency",
      );
    }

    if (!user) {
      // final fallback: return any user in DB (helpful in dev when no verification step completed)
      user = await User.findOne().select(
        "shopName address countryCode phoneNumber whatsappCode whatsappNumber image facebookId instagramId website currency",
      );
    }

    if (!user) {
      return res.status(404).json({ message: "No public profile available" });
    }

    // Ensure the response is JSON
    res.json({
      shopName: user.shopName,
      address: user.address,
      countryCode: user.countryCode || "+1",
      phoneNumber: user.phoneNumber || "N/A",
      whatsappCode: user.whatsappCode || "+1",
      whatsappNumber: user.whatsappNumber || "N/A",
      currency: user.currency,
    });
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
      "shopName address countryCode phoneNumber whatsappCode whatsappNumber image facebookId instagramId website currency",
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
      countryCode,
      phoneNumber,
      whatsappCode,
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
    if (req.user && req.userId) {
      user = await User.findById(req.userId);
    } else {
      user = await User.findOne({ isAdmin: true });
    }
    if (!user) {
      {
        user.password = password;
        user.hasSetPassword = true; // Mark that user has set a custom password
      }
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields
    if (username) user.username = username;
    if (password) user.password = password;
    if (shopName !== undefined) user.shopName = shopName;
    if (address !== undefined) user.address = address;
    if (countryCode !== undefined) user.countryCode = countryCode;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (whatsappCode !== undefined) user.whatsappCode = whatsappCode;
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

    const user = await User.findById(req.userId);
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
      mainUser: req.userId,
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
    if (req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot manage sub-users" });
    }
    const subUsers = await SubUser.find({ mainUser: req.userId }).select(
      "-password",
    );
    res.json({ subUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: get all sub-users across all users
const getAllSubUsers = async (req, res) => {
  try {
    const subUsers = await SubUser.find()
      .select("-password")
      .populate("mainUser", "username email shopName");
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
      mainUser: req.userId,
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
    // Only main users (not sub-users) or admins can delete sub-users
    if (req.user && req.user.isSubUser) {
      return res
        .status(403)
        .json({ message: "Sub-users cannot delete sub-users" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid sub-user id" });
    }

    let subUser;
    if (req.user && req.user.isAdmin) {
      // Admin can delete any sub-user
      subUser = await SubUser.findByIdAndDelete(id);
    } else {
      // Main user can only delete their own sub-users
      subUser = await SubUser.findOneAndDelete({
        _id: id,
        mainUser: req.userId,
      });
    }
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
      expiresIn: "24h",
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

// Admin: list all users with order statistics
const getAllUsers = async (req, res) => {
  try {
    const Order = require("../models/Order");

    // Use aggregation to get all stats in one query - ONLY VERIFIED USERS
    const users = await User.aggregate([
      {
        $match: {
          isVerified: true,
          archived: false,
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "user",
          as: "orders",
        },
      },
      {
        $lookup: {
          from: "subusers",
          localField: "_id",
          foreignField: "mainUser",
          as: "subUsers",
        },
      },
      {
        $addFields: {
          orderStats: {
            total: { $size: "$orders" },
            pending: {
              $size: {
                $filter: {
                  input: "$orders",
                  as: "order",
                  cond: { $eq: ["$$order.status", "pending"] },
                },
              },
            },
            completed: {
              $size: {
                $filter: {
                  input: "$orders",
                  as: "order",
                  cond: { $eq: ["$$order.status", "completed"] },
                },
              },
            },
            directRecord: {
              $size: {
                $filter: {
                  input: "$orders",
                  as: "order",
                  cond: { $eq: ["$$order.isDirectRecord", true] },
                },
              },
            },
            totalSales: {
              $sum: "$orders.totalAmount",
            },
          },
          subUsersCount: { $size: "$subUsers" },
        },
      },
      {
        $project: {
          password: 0,
          orders: 0,
          subUsers: 0,
        },
      },
    ]);

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: delete a user by id (permanent delete + cascade to sub-users and orders)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Remove sub-users belonging to this user
    await SubUser.deleteMany({ mainUser: id });
    // Remove all orders belonging to this user (shop)
    await Order.deleteMany({ user: id });
    res.json({ message: "User and related data deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: toggle user active/archived status
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent deactivating admin accounts
    if (user.isAdmin && !user.archived) {
      return res.status(403).json({
        message: "Admin accounts cannot be deactivated",
      });
    }

    user.archived = !user.archived;
    await user.save();

    res.json({
      message: `User ${
        user.archived ? "deactivated" : "activated"
      } successfully`,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        archived: user.archived,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Self-archive (soft-delete) account — keeps data so re-registering restores it
const deleteProfile = async (req, res) => {
  try {
    if (req.user.isSubUser) {
      // Delete sub-user
      await SubUser.findByIdAndDelete(req.userId);
      return res.json({ message: "Sub-user account deleted" });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.archived = true;
    user.isVerified = false; // Force re-verification on restore
    await user.save();

    res.json({
      message:
        "Account archived successfully. Re-register with the same email to restore all your data.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  googleLogin,
  checkEmailAvailability,
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
  getAllSubUsers,
  updateSubUser,
  deleteSubUser,
  getCounts,
  createInitialAdmin,
  adminLogin,
  adminCreateUser,
  adminUpdateUser,
  getAllUsers,
  deleteUser,
  toggleUserStatus,
  deleteProfile,
  subUserLogin,
};
