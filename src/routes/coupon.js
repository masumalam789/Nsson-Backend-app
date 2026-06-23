"use strict";

const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middleware/auth");
const {
  getAvailableCoupons,
  applyCoupon,
  getMyAssignedCoupons,
} = require("../controllers/couponController");

// ─── Customer Routes ──────────────────────────────────────────────────────────
router.get("/", authMiddleware, getAvailableCoupons);
router.get("/mine", authMiddleware, getMyAssignedCoupons);
router.post("/apply", authMiddleware, applyCoupon);

module.exports = router;

