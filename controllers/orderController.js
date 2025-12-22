// Mark order as delivered
const markAsDelivered = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!isAdminUser && order.user.toString() !== targetUserId.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    order.status = "delivered";
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const SubUser = require("../models/SubUser");

// Helper to generate tracking ID
const generateTrackingId = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  let trackingId;
  let exists = true;

  for (let i = 0; i < 10 && exists; i++) {
    const randomSuffix = String(Math.floor(Math.random() * 10000)).padStart(
      4,
      "0"
    );
    trackingId = `ORD${year}${month}${day}_${randomSuffix}`;
    exists = await Order.findOne({ trackingId });
  }

  if (exists) throw new Error("Unable to generate unique tracking ID");

  return trackingId;
};

// Create new order
const createOrder = async (req, res) => {
  try {
    const orderData = req.body;

    // Resolve main shop owner (if sub-user)
    let ownerId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      ownerId = subUser.mainUser;
    }

    let trackingId = orderData.trackingId?.trim();

    if (!trackingId) {
      trackingId = await generateTrackingId();
    } else {
      if (!/^ORD\d{8}_\d{4}$/.test(trackingId)) {
        return res.status(400).json({ message: "Invalid trackingId format" });
      }
      const existing = await Order.findOne({ trackingId });
      if (existing) trackingId = await generateTrackingId();
    }

    const totalAmount = Number(orderData.totalAmount) || 0;
    const advance = Number(orderData.advance) || 0;
    const balance =
      typeof orderData.balance !== "undefined"
        ? Number(orderData.balance)
        : totalAmount - advance;

    const deliveryDate = orderData.deliveryDate
      ? new Date(orderData.deliveryDate)
      : new Date();

    const sanitized = {
      patientName:
        (orderData.patientName && String(orderData.patientName).trim()) ||
        (orderData.name && String(orderData.name).trim()) ||
        "Unknown",
      whatsappNumber:
        (orderData.whatsappNumber && String(orderData.whatsappNumber).trim()) ||
        (orderData.whatsapp && String(orderData.whatsapp).trim()) ||
        "0000000000",
      frameDetails: orderData.frameDetails || orderData.frameDetail || "",
      lensType: orderData.lensType || "",
      totalAmount,
      advance,
      balance,
      deliveryDate,
      rightEye: orderData.rightEye || null,
      leftEye: orderData.leftEye || null,
      addInput: orderData.addInput || "",
      note: orderData.note || "",
      importantNote: orderData.note || orderData.importantNote || "",
      specialNote: orderData.specialNote || "",
      trackingId,
      status: orderData.status || "pending",
      user: ownerId, // Always the main shop owner
    };

    const order = new Order(sanitized);
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    console.error("createOrder error:", error);
    res.status(500).json({ message: error.message || "Create failed" });
  }
};

// Get pending orders
const getPendingOrders = async (req, res) => {
  try {
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const baseFilter = { status: "pending", archived: { $ne: true } };

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!requestingUser?.isAdmin) {
      baseFilter.user = targetUserId;
    }

    const orders = await Order.find(baseFilter).populate("user");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get only delivered orders for sales record
const getCompletedOrders = async (req, res) => {
  try {
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const baseFilter = { status: "delivered", archived: { $ne: true } };

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!requestingUser?.isAdmin) {
      baseFilter.user = targetUserId;
    }

    const orders = await Order.find(baseFilter)
      .populate("user")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error("getCompletedOrders error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get all orders (admin only)
const getAllOrders = async (req, res) => {
  try {
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    if (!requestingUser || !requestingUser.isAdmin) {
      return res.status(403).json({ message: "Admin privileges required" });
    }

    const orders = await Order.find().populate("user").sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user orders (pending + completed)
const getUserOrders = async (req, res) => {
  try {
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const includeArchived =
      String(req.query.includeArchived || "").toLowerCase() === "true";
    const baseFilter = {};
    if (!includeArchived) baseFilter.archived = { $ne: true };

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!requestingUser?.isAdmin) {
      baseFilter.user = targetUserId;
    }

    if (req.query.startDate) {
      const sd = new Date(req.query.startDate);
      baseFilter.createdAt = baseFilter.createdAt || {};
      baseFilter.createdAt.$gte = sd;
    }
    if (req.query.endDate) {
      const ed = new Date(req.query.endDate);
      baseFilter.createdAt = baseFilter.createdAt || {};
      ed.setHours(23, 59, 59, 999);
      baseFilter.createdAt.$lte = ed;
    }

    const orders = await Order.find(baseFilter)
      .populate("user")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single order
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!isAdminUser && order.user.toString() !== targetUserId.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update order
const updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!isAdminUser && order.user.toString() !== targetUserId.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    Object.assign(order, req.body);
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete order (soft-delete)
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!isAdminUser && order.user.toString() !== targetUserId.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    order.archived = true;
    await order.save();
    res.json({ message: "Order archived", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark order as complete
const markAsComplete = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    let targetUserId = req.user.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.user.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      targetUserId = subUser.mainUser;
    }

    if (!isAdminUser && order.user.toString() !== targetUserId.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    order.status = "completed";
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  getPendingOrders,
  getCompletedOrders,
  getUserOrders,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  markAsComplete,
  markAsDelivered,
};
