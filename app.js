const express = require("express");
const cors    = require("cors");
const path    = require("path");

const apiRoutes = require("./src/routes/index");

const app = express();

app.use(cors({
  origin:      ["http://localhost:3000", "https://admin-garage-ecommerencr.vercel.app","https://nsson.netlify.app", "https://admin-garage3-ecommerencr.vercel.app", "http://localhost:3001"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
   allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve from backend/uploads/ (where multer actually saves files)
// middleware/Banner.js uses path.join(__dirname, "../../../uploads/banners")
// which resolves to <project-root>/uploads/banners/
// So we serve the parent /uploads folder from the project root:
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Welcome to E-commerce API" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date() });
});

app.use("/api", apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error("Error Stack:", err.stack);
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: "Validation Error", details: err.message });
  }
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" });
  }
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

module.exports = app;
