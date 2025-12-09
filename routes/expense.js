const express = require("express");
const { body } = require("express-validator");
const {
  addExpense,
  getExpenses,
  getExpense,
  deleteExpense,
  updateExpense,
} = require("../controllers/expenseController");
const auth = require("../middlewares/auth");

const router = express.Router();

// Add Expense
router.post(
  "/",
  auth,
  [
    body("amount")
      .isFloat({ min: 0 })
      .withMessage("Amount must be a positive number"),
    body("category")
      .isIn([
        "Salary",
        "Frame Vendors",
        "Lens Vendor",
        "Box Vendor",
        "Marketing",
        "Accessories",
        "Repair and Maintenance",
        "New Asset Purchase",
      ])
      .withMessage("Invalid category"),
    body("date").optional().isISO8601().withMessage("Invalid date format"),
    body("description").optional().isString(),
  ],
  addExpense
);

// Get All Expenses
router.get("/", auth, getExpenses);

// Get Single Expense
router.get("/:id", auth, getExpense);

// Update Expense
router.put(
  "/:id",
  auth,
  [
    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be a positive number"),
    body("category")
      .optional()
      .isIn([
        "Salary",
        "Frame Vendors",
        "Lens Vendor",
        "Box Vendor",
        "Marketing",
        "Accessories",
        "Repair and Maintenance",
        "New Asset Purchase",
      ])
      .withMessage("Invalid category"),
    body("date").optional().isISO8601().withMessage("Invalid date format"),
    body("description").optional().isString(),
  ],
  updateExpense
);

// Delete Expense
router.delete("/:id", auth, deleteExpense);

module.exports = router;
