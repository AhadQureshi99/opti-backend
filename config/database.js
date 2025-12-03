const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/opti";
  try {
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error.message || error);
    console.error(
      "Server will continue running, but database operations will fail until MongoDB is available."
    );
    // Do not exit process here to allow dev server to start for debugging frontend.
  }
};

module.exports = connectDB;
