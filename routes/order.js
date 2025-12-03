const express = require("express");
const auth = require("../middlewares/auth");

const {
  createOrder,
  getPendingOrders,
  getCompletedOrders,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  markAsComplete,
} = require("../controllers/orderController");

const router = express.Router();

// Create new order (authenticated users only)
router.post("/create", auth, createOrder);

// Get pending orders (authenticated). Admin sees all.
router.get("/pending", auth, getPendingOrders);

// Get completed orders (authenticated). Admin sees all.
router.get("/completed", auth, getCompletedOrders);

// Get all orders — admin only
router.get("/all", auth, getAllOrders);

// Get single order (owner or admin)
router.get("/:id", auth, getOrderById);

// Update order (owner or admin)
router.put("/:id", auth, updateOrder);

// Delete order (owner or admin) — soft-delete
router.delete("/:id", auth, deleteOrder);

// Mark order as complete (owner or admin)
router.put("/:id/complete", auth, markAsComplete);
// Accept POST as well (some clients may POST instead of PUT)
router.post("/:id/complete", auth, markAsComplete);

module.exports = router;
