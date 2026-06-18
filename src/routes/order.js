"use strict";

const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middleware/auth");
const { adminMiddleware } = require("../middleware/admin");

const {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/orderController");

const {
  validateCreateOrder,
  validateOrderIdParam,
  validateUpdateOrderStatus,
} = require("../validations/OrderValidation");

// ─── Admin routes (MUST come before /:id) ────────────────────────────────────
router.get("/admin/all", authMiddleware, adminMiddleware, getAllOrders);
router.put(
  "/admin/:id/status",
  authMiddleware,
  adminMiddleware,
  validateUpdateOrderStatus,
  updateOrderStatus,
);
router.patch(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  validateUpdateOrderStatus,
  updateOrderStatus,
);

// ─── User routes ──────────────────────────────────────────────────────────────
router.post('/',           authMiddleware,  createOrder);
router.get ('/',           authMiddleware,                       getMyOrders);
router.get ('/:id',        authMiddleware, validateOrderIdParam, getOrderById);
router.put ('/:id/cancel', authMiddleware, validateOrderIdParam, cancelOrder);

module.exports = router;
