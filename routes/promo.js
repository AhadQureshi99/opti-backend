const express = require("express");
const auth = require("../middlewares/auth");
const isAdmin = require("../middlewares/isAdmin");
const {
  setPromo,
  getPromo,
  deletePromo,
} = require("../controllers/promoController");
const { upload } = require("../controllers/userController"); // reuse multer upload

const router = express.Router();

// GET /api/promo - public
router.get("/", getPromo);

// POST /api/promo - protected (admin) - upload image
router.post("/", auth, isAdmin, upload.single("image"), setPromo);

// DELETE /api/promo - protected (admin)
router.delete("/", auth, isAdmin, deletePromo);

module.exports = router;
