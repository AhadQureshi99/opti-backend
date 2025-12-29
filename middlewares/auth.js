const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user is archived
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.archived) {
      return res.status(403).json({
        message: "Shop deactivated. Contact admin.",
      });
    }

    // decoded may contain { userId, isSubUser, subUserId, mainUser }
    req.user = decoded;
    req.userId = decoded.isSubUser ? decoded.subUserId : decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = auth;
