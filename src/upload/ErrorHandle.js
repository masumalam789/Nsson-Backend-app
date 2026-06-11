
const { MulterError } = require("multer");

// ── 404 handler ──────────────────────────────────────────────────────────────
const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// ── Global error handler ─────────────────────────────────────────────────────
const errorHandler = (err, req, res, _next) => {
  // Multer-specific errors
  if (err instanceof MulterError) {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image file is too large. Maximum size is 2MB."
        : `Upload error: ${err.message}`;
    return res.status(400).json({ success: false, message: msg });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(". ") });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: "Duplicate entry detected." });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid ID format." });
  }

  // HTTP-errors (createError)
  const status  = err.status || err.statusCode || 500;
  const message = err.expose ? err.message : "Internal server error";

  console.error(`[ERROR] ${status} — ${err.message}`);
  if (status === 500) console.error(err.stack);

  res.status(status).json({ success: false, message });
};

module.exports = { notFound, errorHandler };
