const express = require("express");
const { body } = require("express-validator");
const {
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
} = require("../controllers/userController");
const {
  getSubUsersForUser,
  addSubUserForUser,
} = require("../controllers/adminSubUserController");
const auth = require("../middlewares/auth");
const isAdmin = require("../middlewares/isAdmin");

const router = express.Router();

// One-time setup route to create initial admin (only works if no admin exists)
router.post(
  "/setup-admin",
  [
    body("username").isLength({ min: 3 }).trim(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
  ],
  // controller will ensure this only runs when no admin exists
  require("../controllers/userController").createInitialAdmin
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
  require("../controllers/userController").adminLogin
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
    body("phoneNumber").optional().trim(),
    body("whatsappNumber").optional().trim(),
  ],
  updateProfile
);

router.post("/upload-image", auth, upload.single("image"), uploadImage);

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

router.put(
  "/admin/users/:id",
  auth,
  isAdmin,
  [],
  require("../controllers/userController").adminUpdateUser
);

router.get("/admin/users", auth, isAdmin, getAllUsers);
router.delete(
  "/admin/users/:id",
  auth,
  isAdmin,
  require("../controllers/userController").deleteUser
);

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
