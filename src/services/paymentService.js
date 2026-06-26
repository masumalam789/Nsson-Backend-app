// services/paymentService.js
"use strict";

const crypto = require("crypto");
const razorpay = require("../config/Rozerpay");
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const couponService = require("./couponService");

const PAYMENT_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

class PaymentService {
  /**
   * Initiate a Razorpay payment flow.
   * Does everything in one call:
   *   1. Validates cart & stock
   *   2. Creates order (status: awaiting_payment)
   *   3. Reserves stock (deducts immediately)
   *   4. Creates Razorpay order (with coupon-discounted amount if provided)
   *   5. Creates Payment record with 3-min expiry
   *   6. Returns Razorpay params for SDK
   */
  static async initiateRazorpay({
    userId,
    shippingAddressId,
    shippingAddress,
    couponCode,
    couponId,
  }) {
    if (!shippingAddressId && !shippingAddress) {
      throw new Error(
        "Either shippingAddressId or shippingAddress is required",
      );
    }

    // 1. Validate cart
    const cart = await Cart.findOne({ user: userId }).populate(
      "items.product",
      "name stock price",
    );

    if (!cart || !cart.items.length) {
      throw new Error("Cart is empty");
    }

    // 2. Validate stock for every item
    const orderItems = [];
    for (const item of cart.items) {
      const product = item.product;
      if (!product) {
        throw new Error("One or more products no longer exist");
      }
      if (product.stock < item.quantity) {
        throw new Error(
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

    const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS);

    // ── Optional coupon discount ─────────────────────────────────────────────
    let finalTotal = subtotal;
    let discountAmount = 0;
    let resolvedCouponId = couponId;
    let appliedCouponCode = couponCode;

    if (couponId && (!appliedCouponCode || !appliedCouponCode.trim())) {
      const couponObj = await Coupon.findById(couponId);
      if (couponObj) {
        appliedCouponCode = couponObj.code;
      }
    }
    if (appliedCouponCode && appliedCouponCode.trim()) {
      const result = await couponService.validateAndCalculate(
        appliedCouponCode,
        subtotal,
        userId,
      );
      discountAmount = result.discountAmount;
      finalTotal = result.finalAmount;
      resolvedCouponId = result.coupon._id;
      appliedCouponCode = result.coupon.code;
    }

    // 3. Create order with awaiting_payment status
    // shippingAddress field accepts either an ObjectId ref or an inline object
    const order = await Order.create({
      userId,
      items: orderItems,
      shippingAddress: shippingAddressId || shippingAddress,
      paymentMethod: "razorpay_upi",
      total: finalTotal,
      originalAmountBeforeDiscount: subtotal,
      discountAmount,
      couponCode: appliedCouponCode,
      couponId: resolvedCouponId,
      status: "awaiting_payment",
      paymentStatus: "UNPAID",
      paymentExpiry: expiresAt,
    });

    // Increment coupon usage after order creation
    if (resolvedCouponId) {
      await couponService.recordCouponUsage(resolvedCouponId, userId);
    }

    // 4. Reserve stock (deduct now, restore on expiry if unpaid)
    await Promise.all(
      orderItems.map(({ productId, quantity }) =>
        Product.findByIdAndUpdate(productId, { $inc: { stock: -quantity } }),
      ),
    );

    // 5. Create Razorpay order (use finalTotal — the coupon-discounted amount)
    const amountInPaise = Math.round(finalTotal * 100);
    const receipt = `rcpt_${order._id}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
    });

    // 6. Create Payment record
    const payment = await Payment.create({
      userId,
      address: shippingAddressId || shippingAddress,
      orderId: String(order._id),
      amount: amountInPaise,
      currency: "INR",
      status: "PENDING",
      paymentMethod: "RAZORPAY",
      razorpayOrderId: razorpayOrder.id,
      receipt,
      expiresAt,
      products: orderItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
      })),
      rawResponse: razorpayOrder,
    });

    // 7. Schedule dynamic check exactly 3 minutes (180000 ms) later to release stock & cancel order if unpaid.
    // This runs exactly once, in-memory, avoiding continuous cron database polling.
    setTimeout(
      async () => {
        try {
          const currentOrder = await Order.findById(order._id);
          if (currentOrder && currentOrder.status === "awaiting_payment") {
            // 1. Restore stock
            await Promise.all(
              currentOrder.items.map(({ productId, quantity }) =>
                Product.findByIdAndUpdate(productId, {
                  $inc: { stock: quantity },
                }),
              ),
            );

            // 2. Cancel order
            currentOrder.status = "cancelled";
            currentOrder.paymentStatus = "FAILED";
            currentOrder.cancellationReason =
              "Payment window expired (3 minutes)";
            currentOrder.cancelledAt = new Date();
            currentOrder.cancelledBy = "system";
            await currentOrder.save();

            // 3. Restore coupon usage if applied
            if (currentOrder.couponId) {
              await couponService.rollbackCouponUsage(
                currentOrder.couponId,
                currentOrder.userId
              );
            }

            // 4. Mark payment EXPIRED
            await Payment.findOneAndUpdate(
              { orderId: String(currentOrder._id), status: "PENDING" },
              { status: "EXPIRED" },
            );

            console.log(
              `[PaymentTimeout] Auto-expired order ${currentOrder._id} (3 mins passed)`,
            );
          }
        } catch (err) {
          console.error(
            `[PaymentTimeout] Failed to auto-expire order ${order._id}:`,
            err?.message || err,
          );
        }
      },
      3 * 60 * 1000,
    );

    return {
      key: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: "INR",
      razorpayOrderId: razorpayOrder.id,
      appOrderId: order._id,
      paymentId: payment._id,
      expiresAt, // Flutter uses this for countdown timer
    };
  }

  /**
   * Verify payment after Razorpay SDK callback.
   * Checks expiry, verifies HMAC signature, marks paid, clears cart.
   */
  static async verifyPayment({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    appOrderId,
    userId,
  }) {
    // 1. Find existing payment record
    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!payment) {
      throw new Error("Payment record not found for this Razorpay order");
    }

    // Ownership checks
    if (String(payment.orderId) !== String(appOrderId)) {
      throw new Error("Payment does not belong to this order");
    }
    if (userId && String(payment.userId) !== String(userId)) {
      throw new Error("Payment does not belong to this user");
    }

    // Already processed — idempotent
    if (payment.status === "SUCCESS") {
      return payment;
    }

    // 2. Check if payment window expired
    if (payment.isExpired()) {
      throw new Error(
        "Payment window has expired. Your order was cancelled automatically.",
      );
    }

    // 3. Verify HMAC signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await Payment.findByIdAndUpdate(payment._id, {
        status: "FAILED",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        failedAt: new Date(),
      });
      throw new Error("Invalid payment signature");
    }

    // 4. Mark payment SUCCESS
    const updatedPayment = await Payment.findByIdAndUpdate(
      payment._id,
      {
        status: "SUCCESS",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      },
      { new: true },
    );

    // 5. Update order → processing + PAID
    const orderFilter = { _id: appOrderId };
    if (userId) orderFilter.userId = userId;

    const order = await Order.findOneAndUpdate(
      orderFilter,
      {
        status: "processing",
        paymentStatus: "PAID",
      },
      { new: true },
    );

    if (!order) {
      throw new Error("Order not found");
    }

    // 6. Clear cart after successful payment
    await Cart.findOneAndDelete({ user: userId });

    return (
      updatedPayment || {
        userId: order.userId,
        orderId: String(order._id),
        amount: Math.round(order.total * 100),
        currency: "INR",
        status: "SUCCESS",
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      }
    );
  }

  /**
   * Check payment status by polling Razorpay API directly.
   * Used as an app-side fallback endpoint.
   */
  static async checkPaymentStatus({ appOrderId, userId }) {
    const payment = await Payment.findOne({
      orderId: String(appOrderId),
    });

    if (!payment) {
      throw new Error("Payment not found for this order");
    }
    if (userId && String(payment.userId) !== String(userId)) {
      throw new Error("Unauthorized");
    }

    // Already resolved
    if (
      ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED"].includes(payment.status)
    ) {
      const order = await Order.findById(appOrderId).select(
        "status paymentStatus",
      );
      return {
        paymentStatus: payment.status,
        orderStatus: order?.status || "unknown",
        orderPaymentStatus: order?.paymentStatus || "UNPAID",
        razorpayOrderId: payment.razorpayOrderId,
        expiresAt: payment.expiresAt,
      };
    }

    // Still PENDING — poll Razorpay for real-time status
    if (payment.razorpayOrderId) {
      try {
        const rzpOrder = await razorpay.orders.fetch(payment.razorpayOrderId);
        const rzpPayments = await razorpay.orders.fetchPayments(
          payment.razorpayOrderId,
        );

        // Check if any payment in this order was captured
        const captured = rzpPayments.items?.find(
          (p) => p.status === "captured",
        );

        if (captured) {
          // Payment was captured but verify didn't fire — fix it now
          payment.status = "SUCCESS";
          payment.razorpayPaymentId = captured.id;
          payment.paidAt = new Date();
          await payment.save();

          await Order.findByIdAndUpdate(appOrderId, {
            status: "processing",
            paymentStatus: "PAID",
          });

          await Cart.findOneAndDelete({ user: userId });

          return {
            paymentStatus: "SUCCESS",
            orderStatus: "processing",
            orderPaymentStatus: "PAID",
            razorpayOrderId: payment.razorpayOrderId,
            recoveredByPoll: true,
          };
        }

        // Check if expired
        if (payment.isExpired()) {
          return {
            paymentStatus: "EXPIRED",
            orderStatus: "cancelled",
            orderPaymentStatus: "FAILED",
            razorpayOrderId: payment.razorpayOrderId,
            expiresAt: payment.expiresAt,
          };
        }

        // Still waiting
        return {
          paymentStatus: "PENDING",
          orderStatus: "awaiting_payment",
          orderPaymentStatus: "UNPAID",
          razorpayOrderId: payment.razorpayOrderId,
          razorpayStatus: rzpOrder.status,
          expiresAt: payment.expiresAt,
        };
      } catch (err) {
        console.error("[PaymentService] Razorpay poll error:", err.message);
      }
    }

    // Fallback response
    return {
      paymentStatus: payment.status,
      orderStatus: "awaiting_payment",
      orderPaymentStatus: "UNPAID",
      razorpayOrderId: payment.razorpayOrderId,
      expiresAt: payment.expiresAt,
    };
  }

  /**
   * Cancel payment immediately (called when client cancels Razorpay checkout)
   * Restores stock and cancels the order immediately.
   */
  static async cancelPayment({ appOrderId, userId }) {
    const order = await Order.findOne({
      _id: appOrderId,
      userId,
      status: "awaiting_payment",
    });

    if (!order) {
      throw new Error("Order not found or cannot be cancelled");
    }

    // 1. Restore stock
    await Promise.all(
      order.items.map(({ productId, quantity }) =>
        Product.findByIdAndUpdate(productId, { $inc: { stock: quantity } }),
      ),
    );

    // 2. Cancel order
    order.status = "cancelled";
    order.paymentStatus = "FAILED";
    order.cancellationReason = "Payment cancelled by user";
    order.cancelledAt = new Date();
    order.cancelledBy = "user";
    await order.save();

    // 3. Restore coupon usage if applied
    if (order.couponId) {
      await couponService.rollbackCouponUsage(order.couponId, order.userId);
    }

    // 4. Mark payment CANCELLED
    await Payment.findOneAndUpdate(
      { orderId: String(order._id), status: "PENDING" },
      { status: "CANCELLED" },
    );

    return {
      success: true,
      orderStatus: "cancelled",
      paymentStatus: "CANCELLED",
    };
  }
}

module.exports = PaymentService;
