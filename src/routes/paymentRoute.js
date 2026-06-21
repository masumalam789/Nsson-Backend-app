// routes/paymentRoutes.js
"use strict";

const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");

const {
  initiateRazorpay,
  getRazorpayKey,
  verifyPayment,
  checkPaymentStatus,
  handleWebhook,
  cancelRazorpayPayment,
} = require("../controllers/paymentController");

// ─── Razorpay Flow ────────────────────────────────────────────────────────────
// Step 1: Flutter calls this to get Razorpay SDK params (creates order + reserves stock)
router.post("/razorpay/initiate", authMiddleware, initiateRazorpay);

// Step 1.5: Flutter calls this if user cancels Razorpay SDK checkout
router.post("/razorpay/cancel", authMiddleware, cancelRazorpayPayment);

// Step 2: Flutter opens Razorpay SDK with returned params

// Step 3: After SDK callback, Flutter calls verify
router.post("/razorpay/verify", authMiddleware, verifyPayment);

// Utility: Get Razorpay key for SDK initialization
router.get("/razorpay/key", authMiddleware, getRazorpayKey);

// ─── Fallback: Poll payment status ────────────────────────────────────────────
// Flutter can call this if verify didn't fire (app crash, network drop)
router.get("/status/:orderId", authMiddleware, checkPaymentStatus);

// ─── Webhook: Razorpay server-to-server (no auth) ────────────────────────────
// Raw body parsing is done in app.js BEFORE express.json()
router.post("/webhook", handleWebhook);

module.exports = router;
