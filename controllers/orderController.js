const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");

// Create new order
const createOrder = async (req, res) => {
  try {
    const orderData = req.body;
    // Normalize incoming fields and provide sensible defaults so
    // client-side omissions (especially when offline) don't crash the server.
    const totalAmount = Number(orderData.totalAmount) || 0;
    const advance = Number(orderData.advance) || 0;
    const balance =
      typeof orderData.balance !== "undefined"
        ? Number(orderData.balance)
        : Number((totalAmount - advance).toFixed(2));

    const deliveryDate = orderData.deliveryDate
      ? new Date(orderData.deliveryDate)
      : new Date();

    // Generate tracking ID: odrYYYYMMDD_HHMM_XXXX (with 4-digit random suffix for uniqueness)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const randomSuffix = String(Math.floor(Math.random() * 10000)).padStart(
      4,
      "0"
    );
    const trackingId = `odr${year}${month}${day}_${hours}${minutes}_${randomSuffix}`;

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
      addInput: orderData.addInput || orderData.addInput || "",
      importantNote: orderData.note || orderData.importantNote || "",
      trackingId,
      status: orderData.status || "pending",
    };

    // Attach user from auth middleware (route requires auth)
    if (req.user && req.user.userId) sanitized.user = req.user.userId;

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
    // If admin, return all pending orders; otherwise only the user's orders
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const baseFilter = { status: "pending", archived: { $ne: true } };
    if (!requestingUser || !requestingUser.isAdmin) {
      baseFilter.user = req.user.userId;
    }
    const orders = await Order.find(baseFilter).populate("user");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get order by id
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    // Allow if admin or owner
    if (!isAdminUser) {
      if (!order.user || order.user._id.toString() !== req.user.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get completed orders
const getCompletedOrders = async (req, res) => {
  try {
    // If admin, return all completed orders; otherwise only the user's orders
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const baseFilter = { status: "completed", archived: { $ne: true } };
    if (!requestingUser || !requestingUser.isAdmin) {
      baseFilter.user = req.user.userId;
    }
    const orders = await Order.find(baseFilter).populate("user");
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get orders for the authenticated user (both pending and completed)
const getUserOrders = async (req, res) => {
  try {
    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    // By default exclude archived; allow override with ?includeArchived=true
    const includeArchived =
      String(req.query.includeArchived || "").toLowerCase() === "true";
    const baseFilter = {};
    if (!includeArchived) baseFilter.archived = { $ne: true };

    // If not admin, only return the user's orders
    if (!requestingUser || !requestingUser.isAdmin) {
      baseFilter.user = req.user.userId;
    }

    // Optional date filters via query params
    if (req.query.startDate) {
      const sd = new Date(req.query.startDate);
      baseFilter.createdAt = baseFilter.createdAt || {};
      baseFilter.createdAt.$gte = sd;
    }
    if (req.query.endDate) {
      const ed = new Date(req.query.endDate);
      baseFilter.createdAt = baseFilter.createdAt || {};
      // include end of day
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

// Update order
const updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    if (!isAdminUser) {
      if (!order.user || order.user.toString() !== req.user.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    Object.assign(order, req.body);
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete order
// Soft-delete (archive) order instead of removing from DB so it still appears in search
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    if (!isAdminUser) {
      if (!order.user || order.user.toString() !== req.user.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    order.archived = true;
    await order.save();
    res.json({ message: "Order archived", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all orders
const getAllOrders = async (req, res) => {
  try {
    // Only admin may list all orders
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

// Mark order as complete
const markAsComplete = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const requestingUser = await User.findById(req.user.userId).select(
      "isAdmin"
    );
    const isAdminUser = requestingUser && requestingUser.isAdmin;

    if (!isAdminUser) {
      if (!order.user || order.user.toString() !== req.user.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
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
};
