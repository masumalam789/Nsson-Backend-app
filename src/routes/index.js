"use strict";

const express = require("express");
const router = express.Router();

console.log("🔄 Starting routes initialization...");

// ─── Import all route files ───────────────────────────────────────────────────
const authRoutes = require("./auth");
const productRoutes = require("./product");
const categoryRoutes = require("./categories");
const brandRoutes = require("./brand");
const adminRoutes = require("./admin");
const userRoutes = require("./user");
const cartRoutes = require("./cart");
const orderRoutes = require("./order");
const bannerRoutes = require("./Banner"); // ← ADD THIS
const payment_router = require("./paymentRoute");
const addressRoutes = require("./address");
const notificationRoutes = require("./notifications");
const discountRoutes = require("./discounts");
// ─── Health / test ────────────────────────────────────────────────────────────
router.get("/admin-test", (req, res) => {
  res.json({
    success: true,
    message: "Routes working",
    timestamp: new Date().toISOString(),
  });
});

// ─── Mount all routes ─────────────────────────────────────────────────────────
router.use("/auth", authRoutes); // /api/auth/*
router.use("/products", productRoutes); // /api/products/*
router.use("/categories", categoryRoutes); // /api/categories/*
router.use("/brands", brandRoutes); // /api/brands/*
router.use("/admin", adminRoutes); // /api/admin/*
router.use("/users", userRoutes); // /api/users/*
router.use("/cart", cartRoutes); // /api/cart/*
router.use("/orders", orderRoutes); // /api/orders/*
router.use("/banners", bannerRoutes); // /api/banners/*   ← ADD THIS
router.use("/payment", payment_router);
router.use("/payments", payment_router);
router.use("/address", addressRoutes);
router.use("/notifications", notificationRoutes);
router.use("/discounts", discountRoutes);
console.log("🎉 All routes mounted successfully!");

module.exports = router;
