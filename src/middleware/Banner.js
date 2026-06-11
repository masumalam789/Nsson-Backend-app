const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

// ── Upload directory ──────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../../uploads/banners");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Storage ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),

  filename: (_req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const basename = path.basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "")
      .slice(0, 40)
      .toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `banner-${basename}-${unique}${ext}`);
  },
});

// ── File filter ───────────────────────────────────────────────────────────────
const fileFilter = (_req, file, cb) => {
  const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  if (ALLOWED.includes(file.mimetype)) return cb(null, true);
  const err = new Error("Only image files (JPEG, PNG, WEBP, GIF) are allowed");
  err.status = 400;
  cb(err, false);
};

// ── Multer instance ───────────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB
    files: 1,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Safely delete a file from disk */
const deleteFile = (filename) => {
  if (!filename) return;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error(`⚠️  Could not delete banner image ${filename}:`, err.message);
    }
  });
};

/** Build the public URL for a stored filename */
const buildUrl = (filename) => {
  if (!filename) return null;
  const base = process.env.BASE_URL || "https://garage-admin-backend-1.onrender.com";
  return `${base}/uploads/banners/${filename}`;  // ✅ includes /banners/
};

module.exports = { upload, deleteFile, buildUrl, UPLOAD_DIR };
