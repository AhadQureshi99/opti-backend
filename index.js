require("dotenv").config(); // Load environment variables

const path = require("path");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");
const userRoutes = require("./routes/user");
const expenseRoutes = require("./routes/expense");
const orderRoutes = require("./routes/order");
const promoRoutes = require("./routes/promo");
const syncRoutes = require("./routes/sync");
const errorHandler = require("./middlewares/error");

const app = express();

// Connect to database
connectDB();

// CORS Configuration
const corsOptions = {
  origin: [
    "https://www.optislip.com",
    "https://optislip.com",
    "https://dashboard.optislip.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/user", userRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/promo", promoRoutes);
app.use("/api/sync", syncRoutes);

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
