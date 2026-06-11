// routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const {
  createOrder,
  createRazorpayOrder,
  getRazorpayKey,
  verifyPayment,
  handleWebhook,
} = require("../controllers/paymentController");
const { authMiddleware } = require("../middleware/auth");

router.post("/create-order", createOrder);
router.get("/razorpay/key", authMiddleware, getRazorpayKey);
router.post("/razorpay/create-order", authMiddleware, createRazorpayOrder);
router.post("/razorpay/verify", authMiddleware, verifyPayment);
router.post("/verify", authMiddleware, verifyPayment);
router.post("/webhook", handleWebhook); // ✅ raw body needed

module.exports = router;
