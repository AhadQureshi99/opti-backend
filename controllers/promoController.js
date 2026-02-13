const fs = require("fs").promises;
const path = require("path");

const PROMO_FILE = path.resolve(__dirname, "../promo.json");

async function getPromo(req, res) {
  try {
    // return promo.json if exists
    try {
      const raw = await fs.readFile(PROMO_FILE, "utf8");
      const data = JSON.parse(raw);
      return res.json(data);
    } catch (e) {
      // not found or parse error -> return null
      return res.status(404).json({ message: "No promo found" });
    }
  } catch (err) {
    console.error("getPromo error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function setPromo(req, res) {
  try {
    const link = req.body.link || "";
    const title = req.body.title || "";

    let imagePath = null;
    if (req.file && req.file.path) {
      imagePath = req.file.path.replace(/\\/g, "/");
    }

    // If an old promo exists, and it points to an uploads file different from the
    // new one, try to remove the old file to avoid orphaned uploads.
    try {
      const prevRaw = await fs.readFile(PROMO_FILE, "utf8").catch(() => null);
      if (prevRaw) {
        const prev = JSON.parse(prevRaw);
        if (prev && prev.image && prev.image !== imagePath) {
          // only remove files under uploads/ to be safe
          const candidate = prev.image;
          if (
            candidate.startsWith("uploads/") ||
            candidate.startsWith("./uploads/") ||
            candidate.startsWith("/uploads/")
          ) {
            const filePath = path.resolve(
              __dirname,
              "..",
              candidate.replace(/^\//, ""),
            );
            try {
              await fs.unlink(filePath).catch(() => {});
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      // ignore any cleanup errors
    }

    const promo = { image: imagePath, link, title, lastModified: Date.now() };
    await fs.writeFile(PROMO_FILE, JSON.stringify(promo, null, 2), "utf8");
    return res.json({ message: "Promo updated", promo });
  } catch (err) {
    console.error("setPromo error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function deletePromo(req, res) {
  try {
    // remove promo.json if exists and delete associated image
    try {
      const prevRaw = await fs.readFile(PROMO_FILE, "utf8").catch(() => null);
      if (prevRaw) {
        const prev = JSON.parse(prevRaw);
        if (prev && prev.image) {
          const candidate = prev.image;
          if (
            candidate.startsWith("uploads/") ||
            candidate.startsWith("./uploads/") ||
            candidate.startsWith("/uploads/")
          ) {
            const filePath = path.resolve(
              __dirname,
              "..",
              candidate.replace(/^\//, ""),
            );
            try {
              await fs.unlink(filePath).catch(() => {});
            } catch (e) {}
          }
        }
      }
      await fs.unlink(PROMO_FILE).catch(() => {});
    } catch (e) {
      // ignore missing file
    }
    return res.json({ message: "Promo removed" });
  } catch (err) {
    console.error("deletePromo error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = { getPromo, setPromo, deletePromo };
