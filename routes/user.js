const express = require("express");
const { body } = require("express-validator");

const router = express.Router(); // Moved to the top to fix the initialization error!

// All controller imports in one place
const {
  googleLogin,
  subUserLogin,
  sendOTPHandler,
  verifyOTP,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  getPublicProfile,
  getPublicProfileById,
  updateProfile,
  uploadImage,
  upload,
  addSubUser,
  getSubUsers,
  updateSubUser,
  deleteSubUser,
  getCounts,
  adminCreateUser,
  getAllUsers,
  createInitialAdmin,
  adminLogin,
  deleteProfile,
  toggleUserStatus,
  adminUpdateUser,
  deleteUser,
} = require("../controllers/userController");

const {
  getSubUsersForUser,
  addSubUserForUser,
} = require("../controllers/adminSubUserController");

const auth = require("../middlewares/auth");
const isAdmin = require("../middlewares/isAdmin");

// Google OAuth login endpoint
router.post("/google-login", [body("token").exists().isString()], googleLogin);

// Google OAuth auth endpoint (alias for compatibility)
router.post("/google-auth", [body("token").exists().isString()], googleLogin);

// Sub-user login endpoint
router.post(
  "/sub-user/login",
  [
    body("email").exists().isString().trim(),
    body("password").exists().isString(),
  ],
  subUserLogin
);

// One-time setup route to create initial admin (only works if no admin exists)
router.post(
  "/setup-admin",
  [
    body("username").isLength({ min: 3 }).trim(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
  ],
  createInitialAdmin
);

// Send OTP for registration
router.post(
  "/send-otp",
  [
    body("email").isEmail().normalizeEmail(),
    body("username").isLength({ min: 3 }).trim(),
    body("password").isLength({ min: 6 }),
  ],
  sendOTPHandler
);

// Verify OTP and register user
router.post(
  "/verify-otp",
  [
    body("email").isEmail().normalizeEmail(),
    body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  verifyOTP
);

// Login (accepts email or username)
router.post(
  "/login",
  [
    body("email").exists().isString().trim(),
    body("password").exists().isString(),
  ],
  login
);

// Admin-only login used by dashboard
router.post(
  "/admin/login",
  [
    body("email").exists().isString().trim(),
    body("password").exists().isString(),
  ],
  adminLogin
);

// Forgot password
router.post(
  "/forgot-password",
  [body("email").isEmail().normalizeEmail()],
  forgotPassword
);

// Reset password
router.post(
  "/reset-password",
  [
    body("email").isEmail().normalizeEmail(),
    body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
    body("newPassword").isLength({ min: 6 }),
  ],
  resetPassword
);

// Protected routes for profile management
router.get("/profile", auth, getProfile);

// Public profile for homepage (no auth)
router.get("/public-profile", getPublicProfile);

// Public profile for a specific user id (no auth)
router.get("/public/:id", getPublicProfileById);

router.put(
  "/profile",
  auth,
  [
    body("username").optional().isLength({ min: 3 }).trim(),
    body("password").optional().isLength({ min: 6 }),
    body("shopName").optional().trim(),
    body("address").optional().trim(),
    body("countryCode").optional().trim(),
    body("phoneNumber").optional().trim(),
    body("whatsappCode").optional().trim(),
    body("whatsappNumber").optional().trim(),
  ],
  updateProfile
);

router.post("/upload-image", auth, upload.single("image"), uploadImage);

// Self-archive (soft-delete) account — keeps data so re-registering restores it
router.delete("/profile", auth, deleteProfile);

// Protected routes for sub-user management
router.post(
  "/sub-users",
  auth,
  [
    body("subUsername").isLength({ min: 3 }).trim(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("phoneNumber").isLength({ min: 10 }).trim(),
  ],
  addSubUser
);

router.get("/sub-users", auth, getSubUsers);

router.put(
  "/sub-users/:id",
  auth,
  [
    body("subUsername").optional().isLength({ min: 3 }).trim(),
    body("email").optional().isEmail().normalizeEmail(),
    body("password").optional().isLength({ min: 6 }),
    body("phoneNumber").optional().isLength({ min: 10 }).trim(),
  ],
  updateSubUser
);

router.delete("/sub-users/:id", auth, deleteSubUser);

// Get total count of users and sub-users (protected)
router.get("/counts", auth, getCounts);

// Admin routes
router.post(
  "/admin/create-user",
  auth,
  isAdmin,
  [
    body("username").isLength({ min: 3 }).trim(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
  ],
  adminCreateUser
);

router.put("/admin/users/:id", auth, isAdmin, [], adminUpdateUser);

router.get("/admin/users", auth, isAdmin, getAllUsers);

router.delete("/admin/users/:id", auth, isAdmin, deleteUser);

router.patch("/admin/users/:id/toggle-status", auth, isAdmin, toggleUserStatus);

// Admin routes for sub-users of a specific user
router.get("/admin/users/:id/sub-users", auth, isAdmin, getSubUsersForUser);

router.post(
  "/admin/users/:id/sub-users",
  auth,
  isAdmin,
  [
    body("subUsername").isLength({ min: 3 }).trim(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("phoneNumber").isLength({ min: 10 }).trim(),
  ],
  addSubUserForUser
);

module.exports = router;
