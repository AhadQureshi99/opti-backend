const Expense = require("../models/Expense");
const { validationResult } = require("express-validator");

// Add Expense
const addExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, category, date, description, cashPaid, cashInHand } =
      req.body;
    const userId = req.user.userId;

    const expense = new Expense({
      user: userId,
      amount,
      category,
      date: date ? new Date(date) : new Date(),
      description: description || "",
      cashPaid: cashPaid || 0,
      cashInHand: cashInHand || 0,
    });

    await expense.save();

    res.status(201).json({
      message: "Expense added successfully",
      expense: {
        _id: expense._id,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        description: expense.description,
        cashPaid: expense.cashPaid,
        cashInHand: expense.cashInHand,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get All Expenses for User
const getExpenses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, startDate, endDate } = req.query;

    let filter = { user: userId };

    if (category) {
      filter.category = category;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set to end of day for inclusive range
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const expenses = await Expense.find(filter).sort({ date: -1 });

    // Calculate total
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    res.json({
      message: "Expenses retrieved successfully",
      total,
      count: expenses.length,
      expenses: expenses.map((exp) => ({
        _id: exp._id,
        amount: exp.amount,
        category: exp.category,
        date: exp.date,
        description: exp.description,
        cashPaid: exp.cashPaid,
        cashInHand: exp.cashInHand,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get Single Expense
const getExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const expense = await Expense.findOne({ _id: id, user: userId });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json({
      message: "Expense retrieved successfully",
      expense: {
        _id: expense._id,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        description: expense.description,
        cashPaid: expense.cashPaid,
        cashInHand: expense.cashInHand,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete Expense
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const expense = await Expense.findOneAndDelete({ _id: id, user: userId });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update Expense
const updateExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { amount, category, date, description, cashPaid, cashInHand } =
      req.body;
    const userId = req.user.userId;

    const updateData = {};
    if (amount !== undefined) updateData.amount = amount;
    if (category !== undefined) updateData.category = category;
    if (date !== undefined) updateData.date = new Date(date);
    if (description !== undefined) updateData.description = description;
    if (cashPaid !== undefined) updateData.cashPaid = cashPaid;
    if (cashInHand !== undefined) updateData.cashInHand = cashInHand;

    const expense = await Expense.findOneAndUpdate(
      { _id: id, user: userId },
      updateData,
      { new: true }
    );

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json({
      message: "Expense updated successfully",
      expense: {
        _id: expense._id,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        description: expense.description,
        cashPaid: expense.cashPaid,
        cashInHand: expense.cashInHand,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addExpense,
  getExpenses,
  getExpense,
  deleteExpense,
  updateExpense,
};
