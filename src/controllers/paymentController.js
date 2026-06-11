// controllers/paymentController.js
const PaymentService = require("../services/paymentService");
const crypto = require("crypto");
const razorpay = require("../config/Rozerpay");
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const notificationService = require("../services/notificationService");

exports.renderProductPage = async (req, res) => {
  try {
    return res.render("index");
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { userId, orderId, addressId } = req.body;

    if (!userId || !orderId || !addressId) {
      return res.status(400).json({
        success: false,
        message: "userId, orderId and addressId are required",
      });
    }

    const data = await PaymentService.createOrder({ userId, orderId, addressId });

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      ...data,
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create Razorpay order",
    });
  }
};

exports.getRazorpayKey = async (req, res) => {
  return res.status(200).json({ key: process.env.RAZORPAY_KEY_ID });
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount is required and must be greater than 0",
      });
    }

    const amountInPaise = Math.round(amount * 100);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${req.user._id}_${Date.now()}`,
    });

    return res.status(200).json({
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: razorpayOrder.currency || "INR",
    });
  } catch (error) {
    console.error("Create Razorpay order error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create Razorpay order",
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    const appOrderId = req.body.appOrderId || req.body.orderId;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !appOrderId) {
      return res.status(400).json({
        success: false,
        message: "razorpay_order_id, razorpay_payment_id, razorpay_signature and orderId are required",
      });
    }

    const payment = await PaymentService.verifyPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appOrderId,
      userId: req.user._id,
    });

    await notificationService.notifyUser(payment.userId, {
      title: "Payment Successful",
      body: `Your payment of ₹${((payment.amount || 0) / 100).toFixed(2)} was received. Your order is being processed.`,
      category: "approved",
      data: {
        orderId: appOrderId,
        paymentId: payment._id,
        status: payment.status,
        amount: payment.amount ? payment.amount / 100 : 0,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified",
      paymentStatus: "paid",
      payment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Payment verification failed",
    });
  }
};

// ✅ Webhook handler — server side verification
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature" });
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload?.payment?.entity;
    const orderEntity = req.body.payload?.order?.entity;

    if (event === "payment.captured") {
      const payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: paymentEntity.order_id },
        {
          status: "SUCCESS",
          razorpayPaymentId: paymentEntity.id,
          paidAt: new Date(),
          rawWebhookData: req.body,
        }
      );

      const orderId = orderEntity?.receipt?.split("_")[1];
      await Order.findOneAndUpdate(
        { _id: orderId },
        { status: "processing", paymentStatus: "PAID" }
      );

      if (payment) {
        await notificationService.notifyUser(payment.userId, {
          title: "Payment Successful",
          body: `Your payment of ₹${((payment.amount || 0) / 100).toFixed(2)} was received. Your order is being processed.`,
          category: "approved",
          data: {
            orderId,
            paymentId: payment._id,
            status: "SUCCESS",
            amount: payment.amount ? payment.amount / 100 : 0,
          },
        });
      }
    }

    if (event === "payment.failed") {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: paymentEntity.order_id },
        {
          status: "FAILED",
          razorpayPaymentId: paymentEntity.id,
          failedAt: new Date(),
          rawWebhookData: req.body,
        }
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
