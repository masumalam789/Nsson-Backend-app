"use strict";

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Address = require("../models/Address");
const notificationService = require("../services/notificationService");
const { sendToDevice } = require("../utils/appPushNotification");

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

// ─── POST /api/orders ─────────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { shippingAddressId, paymentMethod } = req.body;
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);

    if (!shippingAddressId) {
      return res
        .status(400)
        .json({ success: false, message: "Shipping address ID is required" });
    }

    const isAddressValid = await Address.findOne({
      _id: shippingAddressId,
    });

    if (!isAddressValid) {
      return res.status(404).json({
        success: false,
        message: "Address not found or does not belong to you",
      });
    }

    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.product",
      "name stock price",
    );

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const orderItems = [];
    for (const item of cart.items) {
      const product = item.product;
      if (!product) {
        return res.status(400).json({
          success: false,
          message: "One or more products no longer exist",
        });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}" (available: ${product.stock})`,
        });
      }
      orderItems.push({
        productId: product._id,
        name: product.name,
        quantity: item.quantity,
        price: product.price,
      });
    }

    const total = calcTotal(orderItems);

    const order = await Order.create({
      userId: req.user._id,
      items: orderItems,
      shippingAddress: shippingAddressId,
      paymentMethod: normalizedPaymentMethod,
      total,
      status: "pending",
      paymentStatus: "UNPAID",
    });

    const user = await User.findById(req.user._id).select("fcmToken");

    if (user?.fcmToken) {
      await sendToDevice(user.fcmToken, {
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
          orderId: order._id.toString(),
          paymentMethod: normalizedPaymentMethod,
          status: order.status,
          amount: order.total.toString(),
        },
      });
    }

    // Decrement stock
    await Promise.all(
      orderItems.map(({ productId, quantity }) =>
        Product.findByIdAndUpdate(productId, { $inc: { stock: -quantity } }),
      ),
    );

    // Clear the cart
    await Cart.findOneAndDelete({ user: req.user._id });

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
      .populate("shippingAddress", "phone street city state country zipCode")
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

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus.toUpperCase();

    await order.save();

    if (status) {
      const statusMessages = {
        processing: {
          title: "Order Confirmed",
          body: `Order #${displayOrderId(order)} is being prepared for dispatch.`,
        },
        shipped: {
          title: "Order Shipped",
          body: `Order #${displayOrderId(order)} is on the way! Track your delivery.`,
        },
        delivered: {
          title: "Order Delivered",
          body: `Order #${displayOrderId(order)} has been delivered. Thank you!`,
        },
        cancelled: {
          title: "Order Cancelled",
          body: `Order #${displayOrderId(order)} has been cancelled.`,
        },
      };

      const message = statusMessages[status];
      if (message) {
        await notificationService.notifyUser(
          order.userId,
          {
            title: message.title,
            body: message.body,
            category: "approved",
            data: {
              orderId: order._id,
              status: order.status,
              paymentStatus: order.paymentStatus,
            },
          },
          { createdBy: req.user?._id || null },
        );
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
