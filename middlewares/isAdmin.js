const User = require("../models/User");

const isAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.userId)
      return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isAdmin)
      return res.status(403).json({ message: "Admin privileges required" });

    req.currentUser = user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = isAdmin;
