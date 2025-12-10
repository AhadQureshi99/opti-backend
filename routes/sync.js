const express = require("express");
const {
  addToSyncQueue,
  getPendingSyncs,
  processSyncQueue,
  bulkSync,
  clearSyncQueue,
} = require("../controllers/syncController");
const auth = require("../middlewares/auth");

const router = express.Router();

// Add item to sync queue
router.post("/add", auth, addToSyncQueue);

// Get pending syncs for user
router.get("/pending", auth, getPendingSyncs);

// Process all pending syncs
router.post("/process", auth, processSyncQueue);

// Bulk add multiple items to sync queue
router.post("/bulk", auth, bulkSync);

// Clear sync queue (for testing/debugging)
router.delete("/clear", auth, clearSyncQueue);

module.exports = router;
