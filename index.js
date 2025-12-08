require("dotenv").config(); // Load environment variables

const path = require("path");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");
const userRoutes = require("./routes/user");
const expenseRoutes = require("./routes/expense");
const orderRoutes = require("./routes/order");
const promoRoutes = require("./routes/promo");
const errorHandler = require("./middlewares/error");

const app = express();

// Connect to database
connectDB();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://www.optislip.com",
    ], // add all allowed origins
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // if you are sending cookies
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/user", userRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/promo", promoRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
