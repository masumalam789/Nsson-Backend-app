"use strict";

const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Factory ──────────────────────────────────────────────────────────────────
const createUploader = (folder = "general", prefix = "file") => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
      public_id: (_req, file) => {
        const basename = file.originalname
          .replace(/\.[^/.]+$/, "")
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/gi, "")
          .slice(0, 40)
          .toLowerCase();
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        return `${prefix}-${basename}-${unique}`;
      },
    },
  });

  const fileFilter = (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    const err = new Error(
      "Only image files (JPEG, PNG, WEBP, GIF) are allowed",
    );
    err.status = 400;
    cb(err, false);
  };

  const uploader = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 },
  });

  // ✅ wrap every multer method to catch errors and return clean JSON
  const handleMulterError = (multerFn) => (req, res, next) => {
    multerFn(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        // multer-specific errors
        const messages = {
          LIMIT_FILE_SIZE: "File too large. Maximum size is 2MB.",
          LIMIT_FILE_COUNT: "Too many files uploaded.",
          LIMIT_FIELD_KEY: "Field name too long.",
          LIMIT_UNEXPECTED_FILE: `Unexpected field. Use the correct field name.`,
        };
        return res.status(400).json({
          success: false,
          error: "Upload error",
          message: messages[err.code] || err.message,
        });
      }

      // fileFilter errors (wrong mime type etc.)
      if (err.status === 400) {
        return res.status(400).json({
          success: false,
          error: "Invalid file",
          message: err.message,
        });
      }

      // cloudinary or unknown errors
      console.error("Upload error:", err);
      return res.status(500).json({
        success: false,
        error: "Upload failed",
        message: err.message || "Something went wrong during upload",
      });
    });
  };

  // return same API as multer but wrapped
  return {
    single: (fieldName) => handleMulterError(uploader.single(fieldName)),
    array: (fieldName, maxCount) =>
      handleMulterError(uploader.array(fieldName, maxCount)),
    fields: (fields) => handleMulterError(uploader.fields(fields)),
    none: () => handleMulterError(uploader.none()),
  };
};

// ─── Shared helpers ───────────────────────────────────────────────────────────
const deleteFile = async (publicIdOrUrl) => {
  if (!publicIdOrUrl) return;
  try {
    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.startsWith("http")) {
      const parts = publicIdOrUrl.split("/");
      const file = parts.pop().split(".")[0];
      const folder = parts.pop();
      publicId = `${folder}/${file}`;
    }
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Could not delete Cloudinary image:", err.message);
  }
};

const buildUrl = (publicIdOrUrl) => {
  if (!publicIdOrUrl) return "";
  if (publicIdOrUrl.startsWith("http")) return publicIdOrUrl;
  return cloudinary.url(publicIdOrUrl);
};

// ─── Pre-built uploaders ──────────────────────────────────────────────────────
const upload = createUploader("banners", "banner");
const productUpload = createUploader("products", "product");
const brandUpload = createUploader("brands", "brand");

module.exports = {
  upload,
  productUpload,
  brandUpload,
  createUploader,
  deleteFile,
  buildUrl,
};
