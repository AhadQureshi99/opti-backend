const SyncQueue = require("../models/SyncQueue");
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const User = require("../models/User");
const SubUser = require("../models/SubUser");

// Add items to sync queue (from frontend)
const addToSyncQueue = async (req, res) => {
  try {
    let userId = req.userId;
    if (req.user.isSubUser) {
      const subUser = await require("../models/SubUser").findById(req.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      userId = subUser.mainUser;
    }
    const { endpoint, method, data, deviceId } = req.body;

    if (!endpoint || !method) {
      return res.status(400).json({ message: "Missing endpoint or method" });
    }

    const syncItem = new SyncQueue({
      userId,
      endpoint,
      method,
      data,
      status: "pending",
      deviceId: deviceId || null,
    });

    await syncItem.save();

    res.status(201).json({
      message: "Item added to sync queue",
      syncItem,
    });
  } catch (error) {
    console.error("[Sync] Error adding to queue:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get pending syncs for user (for debugging)
const getPendingSyncs = async (req, res) => {
  try {
    let userId = req.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      userId = subUser.mainUser;
    }

    const pending = await SyncQueue.find({
      userId,
      status: { $in: ["pending", "processing"] },
    }).sort({ priority: -1, createdAt: 1 });

    res.json({
      message: "Pending syncs retrieved",
      count: pending.length,
      syncs: pending,
    });
  } catch (error) {
    console.error("[Sync] Error getting pending syncs:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Process sync queue (main sync endpoint)
const processSyncQueue = async (req, res) => {
  try {
    let userId = req.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      userId = subUser.mainUser;
    }

    // Get all pending syncs for this user
    const pendingSyncs = await SyncQueue.find({
      userId,
      status: "pending",
      $or: [{ retryAt: null }, { retryAt: { $lte: new Date() } }],
    })
      .sort({ priority: -1, createdAt: 1 })
      .limit(50); // Process max 50 at a time

    if (pendingSyncs.length === 0) {
      return res.json({
        message: "No pending syncs",
        processed: 0,
        successful: 0,
        failed: 0,
      });
    }

    let successful = 0;
    let failed = 0;

    for (const syncItem of pendingSyncs) {
      try {
        await syncItem.updateOne({ status: "processing" });

        const result = await processSingleSync(syncItem, userId);

        if (result.success) {
          await syncItem.updateOne({
            status: "completed",
            responseData: result.data,
            error: null,
            attempts: syncItem.attempts + 1,
          });
          successful++;
          console.log(
            `[Sync] ✓ Completed: ${syncItem.method} ${syncItem.endpoint}`
          );
        } else {
          // Retry with exponential backoff
          const nextRetryMs =
            Math.pow(2, Math.min(syncItem.attempts, 4)) * 5000; // Max 80 seconds
          const retryAt = new Date(Date.now() + nextRetryMs);

          const newAttempts = syncItem.attempts + 1;
          const status =
            newAttempts >= syncItem.maxAttempts ? "failed" : "pending";

          await syncItem.updateOne({
            status,
            error: result.error,
            attempts: newAttempts,
            retryAt: status === "pending" ? retryAt : null,
          });

          failed++;
          console.log(
            `[Sync] ✗ Failed (attempt ${newAttempts}): ${syncItem.endpoint}`
          );
        }
      } catch (error) {
        console.error(`[Sync] Error processing item:`, error);
        failed++;

        const newAttempts = syncItem.attempts + 1;
        const status =
          newAttempts >= syncItem.maxAttempts ? "failed" : "pending";

        await syncItem.updateOne({
          status,
          error: error.message,
          attempts: newAttempts,
          retryAt: status === "pending" ? new Date(Date.now() + 5000) : null,
        });
      }
    }

    res.json({
      message: "Sync queue processed",
      processed: pendingSyncs.length,
      successful,
      failed,
    });
  } catch (error) {
    console.error("[Sync] Error processing queue:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Process individual sync item
const processSingleSync = async (syncItem, userId) => {
  try {
    const { endpoint, method, data } = syncItem;

    // Route to appropriate handler based on endpoint
    if (endpoint.includes("/expenses")) {
      return await handleExpenseSync(method, data, userId);
    } else if (endpoint.includes("/orders")) {
      return await handleOrderSync(method, data, userId);
    } else if (endpoint.includes("/user")) {
      return await handleUserSync(method, data, userId);
    } else {
      return { success: false, error: "Unknown endpoint" };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Handle expense sync (POST, PUT, DELETE)
const handleExpenseSync = async (method, data, userId) => {
  try {
    if (method === "POST") {
      // Create new expense
      const expense = new Expense({
        user: userId,
        amount: data.amount,
        category: data.category,
        date: data.date || new Date(),
        description: data.description || "",
      });

      await expense.save();
      return { success: true, data: expense };
    } else if (method === "PUT") {
      // Update expense
      const expense = await Expense.findOne({
        _id: data._id,
        user: userId,
      });

      if (!expense) {
        return { success: false, error: "Expense not found" };
      }

      Object.assign(expense, data);
      await expense.save();
      return { success: true, data: expense };
    } else if (method === "DELETE") {
      // Delete expense
      const expense = await Expense.findOneAndDelete({
        _id: data._id,
        user: userId,
      });

      if (!expense) {
        return { success: false, error: "Expense not found" };
      }

      return { success: true, data: { deletedId: expense._id } };
    }

    return { success: false, error: "Invalid method" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Handle order sync (POST, PUT, DELETE)
const handleOrderSync = async (method, data, userId) => {
  try {
    if (method === "POST") {
      // Create new order
      const order = new Order({
        user: userId,
        ...data,
      });

      await order.save();
      return { success: true, data: order };
    } else if (method === "PUT") {
      // Update order
      const order = await Order.findOne({
        _id: data._id,
        user: userId,
      });

      if (!order) {
        return { success: false, error: "Order not found" };
      }

      Object.assign(order, data);
      await order.save();
      return { success: true, data: order };
    } else if (method === "DELETE") {
      // Delete order
      const order = await Order.findOneAndDelete({
        _id: data._id,
        user: userId,
      });

      if (!order) {
        return { success: false, error: "Order not found" };
      }

      return { success: true, data: { deletedId: order._id } };
    }

    return { success: false, error: "Invalid method" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Handle user sync
const handleUserSync = async (method, data, userId) => {
  try {
    if (method === "PUT") {
      // Update user profile
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (data.name) user.name = data.name;
      if (data.email) user.email = data.email;
      if (data.phone) user.phone = data.phone;

      await user.save();
      return { success: true, data: user };
    }

    return { success: false, error: "Invalid method" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Bulk sync endpoint - for large batches
const bulkSync = async (req, res) => {
  try {
    let userId = req.userId;
    if (req.user.isSubUser) {
      const subUser = await SubUser.findById(req.userId);
      if (!subUser)
        return res.status(403).json({ message: "Sub-user not found" });
      userId = subUser.mainUser;
    }
    const { items } = req.body; // Array of { endpoint, method, data }

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "Items must be an array" });
    }

    const syncItems = items.map((item) => ({
      userId,
      endpoint: item.endpoint,
      method: item.method,
      data: item.data || {},
      status: "pending",
      deviceId: item.deviceId || null,
    }));

    const result = await SyncQueue.insertMany(syncItems);

    res.status(201).json({
      message: "Items added to sync queue",
      count: result.length,
    });
  } catch (error) {
    console.error("[Sync] Bulk sync error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Clear sync queue (for testing)
const clearSyncQueue = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await SyncQueue.deleteMany({ userId });

    res.json({
      message: "Sync queue cleared",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("[Sync] Clear queue error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addToSyncQueue,
  getPendingSyncs,
  processSyncQueue,
  processSingleSync,
  bulkSync,
  clearSyncQueue,
};
