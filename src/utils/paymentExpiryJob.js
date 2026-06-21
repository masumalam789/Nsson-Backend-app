// utils/paymentExpiryJob.js
"use strict";

const cron = require("node-cron");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const { sendToUser } = require("./appPushNotification");

/**
 * Helper to check and clean expired payments.
 */
async function checkAndCleanExpiredPayments() {
  try {
    const now = new Date();

    const expiredOrders = await Order.find({
      status: "awaiting_payment",
      paymentExpiry: { $lt: now },
    });

    if (expiredOrders.length === 0) return;

    console.log(
      `[PaymentExpiry] Found ${expiredOrders.length} expired order(s) to clean up`,
    );

    for (const order of expiredOrders) {
      try {
        // 1. Restore stock
        await Promise.all(
          order.items.map(({ productId, quantity }) =>
            Product.findByIdAndUpdate(productId, {
              $inc: { stock: quantity },
            }),
          ),
        );

        // 2. Cancel order
        order.status = "cancelled";
        order.paymentStatus = "FAILED";
        order.cancellationReason = "Payment window expired (3 minutes)";
        order.cancelledAt = now;
        order.cancelledBy = "system";
        await order.save();

        // 3. Mark payment expired
        await Payment.findOneAndUpdate(
          { orderId: String(order._id), status: "PENDING" },
          { status: "EXPIRED" },
        );

        console.log(
          `[PaymentExpiry] Expired order ${order._id} — stock restored.`,
        );
      } catch (orderErr) {
        console.error(
          `[PaymentExpiry] Failed to process order ${order._id}:`,
          orderErr,
        );
      }
    }
  } catch (err) {
    console.error("[PaymentExpiry] Cleanup error:", err);
  }
}

/**
 * Runs a one-time check on startup, then schedules a lightweight fallback cron
 * running every 15 minutes (instead of every minute).
 * Real-time cancellation is handled dynamically via setTimeout & client cancel callbacks.
 */
function startPaymentExpiryJob() {
  // 1. One-time check on startup
  checkAndCleanExpiredPayments().then(() => {
    console.log("[PaymentExpiry] Initial startup check completed.");
  });

  // 2. Schedule fallback cron job every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    await checkAndCleanExpiredPayments();
  });

  console.log(
    "[PaymentExpiry] ✅ Cron job scheduled — running fallback check every 15 minutes",
  );
}

module.exports = { startPaymentExpiryJob, checkAndCleanExpiredPayments };
