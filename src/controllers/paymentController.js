// controllers/paymentController.js
"use strict";

const crypto = require("crypto");
const PaymentService = require("../services/paymentService");
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const notificationService = require("../services/notificationService");
const { sendToUser } = require("../utils/appPushNotification");

// ─── POST /api/payments/razorpay/initiate ─────────────────────────────────────
// Single endpoint: validates cart → creates order → reserves stock → creates
// Razorpay order → returns SDK params to Flutter. Replaces the old multi-step
// create-order + createRazorpayOrder flow.
exports.initiateRazorpay = async (req, res) => {
  try {
    const { shippingAddressId, shippingAddress } = req.body;

    if (!shippingAddressId && !shippingAddress) {
      return res.status(400).json({
        success: false,
        message: "Either shippingAddressId or shippingAddress is required",
      });
    }

    const result = await PaymentService.initiateRazorpay({
      userId: req.user._id,
      shippingAddressId,
      shippingAddress,
    });

    // Notify user that order is created, awaiting payment (best effort)
    try {
      await sendToUser(req.user._id, {
        title: "Order Created",
        body: `Your order of ₹${(result.amount / 100).toFixed(2)} was created. Complete payment within 3 minutes to confirm.`,
        data: {
          type: "order",
          orderId: result.appOrderId,
          paymentMethod: "razorpay_upi",
          status: "awaiting_payment",
          amount: result.amount / 100,
        },
      });
    } catch (notifErr) {
      console.error(
        "[PaymentController] FCM sendToUser error during initiate:",
        notifErr?.message || notifErr
      );
    }

    return res.status(200).json({
      success: true,
      message: "Razorpay order created. Complete payment within 3 minutes.",
      ...result,
    });
  } catch (error) {
    const msg =
      error?.message ||
      error?.error?.description ||         // Razorpay SDK error shape
      (error?.errors                        // Mongoose validation error
        ? Object.values(error.errors).map((e) => e.message).join(', ')
        : null) ||
      JSON.stringify(error) ||
      'Failed to initiate payment';
    console.error('[PaymentController] initiateRazorpay:', msg);
    return res.status(400).json({ success: false, message: msg });
  }
};

// ─── GET /api/payments/razorpay/key ───────────────────────────────────────────
exports.getRazorpayKey = async (req, res) => {
  return res.status(200).json({ key: process.env.RAZORPAY_KEY_ID });
};

// ─── POST /api/payments/razorpay/verify ───────────────────────────────────────
// Called by Flutter after Razorpay SDK returns a success callback.
// Verifies HMAC signature, checks expiry, marks paid, clears cart.
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    const appOrderId = req.body.appOrderId || req.body.orderId;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !appOrderId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "razorpay_order_id, razorpay_payment_id, razorpay_signature and appOrderId are required",
      });
    }

    const payment = await PaymentService.verifyPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appOrderId,
      userId: req.user._id,
    });

    // Push notification on success (best effort)
    try {
      await sendToUser(req.user._id, {
        title: "Payment Successful",
        body: `Your payment of ₹${((payment.amount || 0) / 100).toFixed(2)} was received. Your order is being processed.`,
        data: {
          type: "order",
          orderId: appOrderId,
          paymentId: payment._id,
          status: "SUCCESS",
          amount: payment.amount ? payment.amount / 100 : 0,
        },
      });
    } catch (notifErr) {
      console.error(
        "[PaymentController] FCM sendToUser error during verify:",
        notifErr?.message || notifErr
      );
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified",
      paymentStatus: "paid",
      payment,
    });
  } catch (error) {
    const msg =
      error?.message ||
      error?.error?.description ||
      (error?.errors
        ? Object.values(error.errors).map((e) => e.message).join(', ')
        : null) ||
      JSON.stringify(error) ||
      'Payment verification failed';
    console.error('[PaymentController] verifyPayment:', msg);
    return res.status(400).json({ success: false, message: msg });
  }
};

// ─── GET /api/payments/status/:orderId ────────────────────────────────────────
// Fallback endpoint: Flutter can poll this if verify callback didn't fire.
// Checks payment status in DB + polls Razorpay API directly.
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "orderId is required" });
    }

    const result = await PaymentService.checkPaymentStatus({
      appOrderId: orderId,
      userId: req.user._id,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const msg =
      error?.message ||
      error?.error?.description ||
      (error?.errors
        ? Object.values(error.errors).map((e) => e.message).join(', ')
        : null) ||
      JSON.stringify(error) ||
      'Failed to check payment status';
    console.error('[PaymentController] checkPaymentStatus:', msg);
    return res.status(400).json({ success: false, message: msg });
  }
};

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
// Razorpay server-to-server webhook. Most reliable — fires even if user's
// phone died. req.body is raw Buffer because of express.raw() in app.js.
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!webhookSecret || !signature) {
      console.error("[Webhook] Missing secret or signature header");
      return res.status(200).json({ success: true }); // always 200 to Razorpay
    }

    // req.body is a raw Buffer (because of express.raw middleware)
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("[Webhook] Signature mismatch");
      return res.status(200).json({ success: true }); // still 200, avoid retries
    }

    const payload =
      typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? JSON.parse(rawBody)
        : req.body;

    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    console.log(`[Webhook] Received event: ${event}`);

    if (event === "payment.captured" && paymentEntity) {
      // Parse orderId from receipt: "rcpt_<orderId>_<timestamp>"
      const receipt = paymentEntity.receipt || "";
      const receiptParts = receipt.split("_");
      const appOrderId = receiptParts.length >= 2 ? receiptParts[1] : null;

      // Mark payment SUCCESS (idempotent — $ne PENDING skips already-done ones)
      await Payment.findOneAndUpdate(
        {
          razorpayOrderId: paymentEntity.order_id,
          status: { $ne: "SUCCESS" },
        },
        {
          status: "SUCCESS",
          razorpayPaymentId: paymentEntity.id,
          paidAt: new Date(),
          rawWebhookData: payload,
        },
      );

      if (appOrderId) {
        // Update order (idempotent)
        const order = await Order.findOneAndUpdate(
          { _id: appOrderId, paymentStatus: { $ne: "PAID" } },
          { status: "processing", paymentStatus: "PAID" },
          { new: true },
        );

        if (order) {
          // Clear cart
          await Cart.findOneAndDelete({ user: order.userId });

          // Push notification (best effort)
          try {
            await sendToUser(order.userId, {
              title: "Payment Confirmed",
              body: `Your payment of ₹${order.total.toFixed(2)} is confirmed. Order is being processed.`,
              data: {
                type: "order",
                orderId: appOrderId,
                status: "processing",
              },
            });
          } catch (notifErr) {
            console.error(
              "[Webhook] Notification error:",
              notifErr?.message || notifErr
            );
          }
        }
      } else {
        console.warn(
          "[Webhook] Could not parse orderId from receipt:",
          receipt,
        );
      }
    }

    if (event === "payment.failed" && paymentEntity) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: paymentEntity.order_id },
        {
          status: "FAILED",
          razorpayPaymentId: paymentEntity.id,
          failedAt: new Date(),
          rawWebhookData: payload,
        },
      );
      // Stock will be restored by cron job when paymentExpiry hits
    }

    // ALWAYS return 200 to Razorpay — otherwise it retries aggressively
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Webhook] Unhandled error:", error);
    return res.status(200).json({ success: true }); // still 200
  }
};

// ─── POST /api/payments/razorpay/cancel ───────────────────────────────────────
// Called by Flutter when the user explicitly cancels or closes the Razorpay sheet.
// Restores stock and marks the order as cancelled immediately.
exports.cancelRazorpayPayment = async (req, res) => {
  try {
    const { appOrderId } = req.body;

    if (!appOrderId) {
      return res.status(400).json({
        success: false,
        message: "appOrderId is required",
      });
    }

    const result = await PaymentService.cancelPayment({
      appOrderId,
      userId: req.user._id,
    });

    return res.status(200).json(result);
  } catch (error) {
    const msg = error?.message || "Failed to cancel payment";
    console.error("[PaymentController] cancelRazorpayPayment:", msg);
    return res.status(400).json({ success: false, message: msg });
  }
};
