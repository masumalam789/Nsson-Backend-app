"use strict";

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Address = require("../models/Address");
const Coupon = require("../models/Coupon");
const { sendToUser, sendNotification } = require("../utils/appPushNotification");
const couponService = require("../services/couponService");
const EmailService = require("../services/emailService");

// ─── Helper ───────────────────────────────────────────────────────────────────
const calcTotal = (items) =>
  items.reduce((sum, i) => sum + i.price * i.quantity, 0);

const normalizePaymentMethod = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (
    normalized === "cod" ||
    normalized === "cash on delivery" ||
    normalized === "cash_on_delivery"
  ) {
    return "cash_on_delivery";
  }
  if (normalized === "prepaid") {
    return "prepaid";
  }
  if (normalized === "razorpay_upi" || normalized === "razorpay") {
    return "razorpay_upi";
  }

  return normalized;
};

const formatAmount = (amount) => `₹${Number(amount || 0).toFixed(2)}`;
const displayOrderId = (order) => order.orderNumber || String(order._id);

const serializeAdminOrder = (order) => {
  const obj =
    typeof order.toObject === "function" ? order.toObject() : { ...order };
  if (obj.userId === null) {
    obj.userId = "";
  }
  return obj;
};

class OrderError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * 1. Create the order from the user's cart.
 * @param {string} couponCode - Optional coupon code to apply
 */
async function createOrderFromCart({
  userId,
  shippingAddressId,
  paymentMethod,
  couponCode,
  couponId
}) {
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

  if (!shippingAddressId) {
    throw new OrderError(400, "Shipping address ID is required");
  }

  const isAddressValid = await Address.findOne({
    _id: shippingAddressId,
  });

  if (!isAddressValid) {
    throw new OrderError(404, "Address not found or does not belong to you");
  }

  const cart = await Cart.findOne({ user: userId }).populate(
    "items.product",
    "name stock price",
  );

  if (!cart || cart.items.length === 0) {
    throw new OrderError(400, "Cart is empty");
  }

  const orderItems = [];
  for (const item of cart.items) {
    const product = item.product;
    if (!product) {
      throw new OrderError(400, "One or more products no longer exist");
    }
    if (product.stock < item.quantity) {
      throw new OrderError(
        400,
        `Insufficient stock for "${product.name}" (available: ${product.stock})`,
      );
    }
    orderItems.push({
      productId: product._id,
      name: product.name,
      quantity: item.quantity,
      price: product.price,
    });
  }

  const subtotal = calcTotal(orderItems);

  // ── Coupon validation & discount calculation ──────────────────────────────
  let finalTotal = subtotal;
  let discountAmount = 0;
  let resolvedCouponId = couponId;
  let appliedCouponCode = null;

  let resolvedCouponCode = couponCode;
  if (resolvedCouponId && (!resolvedCouponCode || !resolvedCouponCode.trim())) {
    const couponObj = await Coupon.findById(resolvedCouponId);
    if (couponObj) {
      resolvedCouponCode = couponObj.code;
    }
  }
  if (resolvedCouponCode && resolvedCouponCode.trim()) {
    try {
      const result = await couponService.validateAndCalculate(
        resolvedCouponCode,
        subtotal,
        userId,
      );
      discountAmount = result.discountAmount;
      finalTotal = result.finalAmount;
      resolvedCouponId = result.coupon._id;
      appliedCouponCode = result.coupon.code;
    } catch (couponErr) {
      throw new OrderError(400, couponErr.message || "Invalid coupon code");
    }
  }
  const order = await Order.create({
    userId: userId,
    items: orderItems,
    shippingAddress: shippingAddressId,
    paymentMethod: normalizedPaymentMethod,
    total: finalTotal,
    originalAmountBeforeDiscount: subtotal,
    discountAmount,
    couponCode: appliedCouponCode,
    couponId: resolvedCouponId,
    status: "pending",
    paymentStatus: "UNPAID",
  });

  // Increment coupon usage after successful order creation
  if (resolvedCouponId) {
    await couponService.recordCouponUsage(resolvedCouponId, userId);
  }

  try {
    if (normalizedPaymentMethod !== "razorpay_upi") {
      await sendToUser(userId, {
        title:
          normalizedPaymentMethod === "cash_on_delivery"
            ? "Order Placed"
            : "Order Created",

        body:
          normalizedPaymentMethod === "cash_on_delivery"
            ? `Your COD order of ${formatAmount(order.total)} has been placed. We'll confirm it shortly.`
            : `Your order of ${formatAmount(order.total)} was created. Complete payment to confirm it.`,

        data: {
          type: "order",
          orderId: order._id,
          paymentMethod: normalizedPaymentMethod,
          status: order.status,
          amount: order.total,
        },
      });
    }
  } catch (notifErr) {
    console.error(
      "[OrderController] FCM sendToUser error during order creation:",
      notifErr?.message || notifErr,
    );
  }
  return order;
}

/**
 * 2. Reduce stock for each item in the order.
 */
async function reduceStockForOrder(order) {
  await Promise.all(
    order.items.map(({ productId, quantity }) =>
      Product.findByIdAndUpdate(productId, { $inc: { stock: -quantity } }),
    ),
  );
}

/**
 * 3. Clear / delete the user's cart.
 */
async function clearCart(userId) {
  await Cart.findOneAndDelete({ user: userId });
}

// 4. RESTORE STOCKS FOR ORDER
async function restoreStockForOrder(order) {
  await Promise.all(
    order.items.map(({ productId, quantity }) =>
      Product.findByIdAndUpdate(productId, { $inc: { stock: quantity } }),
    ),
  );
}

exports.createOrder = async (req, res) => {
  try {
    const { shippingAddressId, paymentMethod, couponCode, couponId } = req.body;
    const normalizedMethod = normalizePaymentMethod(paymentMethod);

    // Block Razorpay from this endpoint — must use POST /payments/razorpay/initiate
    if (
      normalizedMethod === "razorpay_upi" ||
      normalizedMethod === "razorpay"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "For Razorpay payments, use POST /api/payments/razorpay/initiate instead.",
      });
    }

    // COD flow: create order → reduce stock → clear cart
    const order = await createOrderFromCart({
      userId: req.user._id,
      shippingAddressId,
      paymentMethod,
      couponId,
      couponCode,
    });

    await reduceStockForOrder(order);
    await clearCart(req.user._id);

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: String(order.paymentStatus || "").toLowerCase(),
      total: order.total,
      data: order,
    });
  } catch (err) {
    if (err instanceof OrderError) {
      return res
        .status(err.statusCode)
        .json({ success: false, message: err.message });
    }
    console.error("[OrderController] createOrder:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/orders ──────────────────────────────────────────────────────────
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .select("-__v");

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (err) {
    console.error("[OrderController] getMyOrders:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const formatOrderDates = (order) => {
  const obj = order.toObject();

  const toIST = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  };

  const dateFields = ["createdAt", "updatedAt", "deliveredAt", "orderDate"];

  dateFields.forEach((field) => {
    if (obj[field]) obj[field] = toIST(obj[field]);
  });

  return obj;
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userId", "firstName lastName email")
      .populate("shippingAddress", "phone street landmark city state country zipCode")
      .select("-__v");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const isOwner = order.userId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    return res.status(200).json({
      success: true,
      data: formatOrderDates(order), // ✅ all dates converted to IST
    });
  } catch (err) {
    console.error("[OrderController] getOrderById:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── PUT /api/orders/:id/cancel ───────────────────────────────────────────────
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    if (order.userId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an order with status "${order.status}"`,
      });
    }

    order.status = "cancelled";
    order.cancellationReason = req.body.reason || null;
    order.cancelledAt = new Date();
    order.cancelledBy = "user";
    await order.save();

    // Restore stock
    await Promise.all(
      order.items.map(({ productId, quantity }) =>
        Product.findByIdAndUpdate(productId, { $inc: { stock: quantity } }),
      ),
    );

    // Restore coupon usage if a coupon was applied
    if (order.couponId) {
      await couponService.rollbackCouponUsage(order.couponId, order.userId);
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled",
      data: order,
    });
  } catch (err) {
    console.error("[OrderController] cancelOrder:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /api/orders/admin/all ────────────────────────────────────────────────
exports.getAllOrders = async (req, res) => {
  try {
    const filter = {};

    // ✅ Add this — if userId query param is passed, filter by it
    if (req.query.userId) {
      filter.userId = req.query.userId;
    }

    const orders = await Order.find(filter)
      .populate("userId", "firstName lastName email")
      .populate("shippingAddress")
      .sort({ createdAt: -1 });

    res.json({ orders: orders.map(serializeAdminOrder) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PUT /api/orders/admin/:id/status ────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;

    const order = await Order.findById(req.params.id)
      .populate("userId", "firstName lastName email")
      .populate("items.productId", "name")
    ;
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const product_names = order.items.map((item) => item.name).join(", ");

    const previousStatus = order.status;

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus.toUpperCase();

    await order.save();

    // Restore coupon usage if order is being cancelled by admin and was not previously cancelled
    if (status === 'cancelled' && previousStatus !== 'cancelled' && order.couponId) {
      await couponService.rollbackCouponUsage(order.couponId, order.userId);
    }

    if (status) {
      const statusMessages = {
        processing: {
          title: "Order Confirmed",
          body: `Order ${product_names} is being prepared for dispatch.`,
        },
        shipped: {
          title: "Order Shipped",
          body: `Order ${product_names} is on the way! Track your delivery.`,
        },
        delivered: {
          title: "Order Delivered",
          body: `Order ${product_names} has been delivered. Thank you!`,
        },
        cancelled: {
          title: "Order Cancelled",
          body: `Order ${product_names} has been cancelled.`,
        },
        refunded: {
          title: "Order Refunded",
          body: `Order ${product_names} has been refunded.`,
        },
      };

      const message = statusMessages[status];
      if (message) {

        const result = await sendNotification(
          [order.userId],
          {
            title: message.title,
            body: message.body,
            category: "info",
            data: {
              orderId: order._id,
              status: order.status,
              paymentStatus: order.paymentStatus,
            },
          },
          { createdBy: req.user?._id || null },
          true, // send_push_notification
          {
            title: message.title,
            body: message.body
          },
          true, // create_notification_entry
        );

        await EmailService.sendOrderStatusUpdateEmail(order.userId, order, product_names);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated",
      data: order,
    });
  } catch (err) {
    console.error("[OrderController] updateOrderStatus:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


module.exports.createOrderFromCart = createOrderFromCart;
module.exports.reduceStockForOrder = reduceStockForOrder;
module.exports.clearCart = clearCart;
module.exports.OrderError = OrderError;
