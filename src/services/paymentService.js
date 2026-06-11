// services/paymentService.js
const crypto = require("crypto");
const razorpay = require("../config/Rozerpay");
const Payment = require("../models/Payment");
const Order = require("../models/Order");

class PaymentService {

  static async createOrder({ userId, orderId, addressId }) {
    const order = await Order.findOne({ _id: orderId, userId })
      .populate("items.productId");

    if (!order) throw new Error("Order not found");
    if (!order.items.length) throw new Error("Order is empty");

    const amountInPaise = Math.round(order.total * 100);
    if (amountInPaise <= 0) throw new Error("Invalid order amount");

    const receipt = `rcpt_${order._id}_${Date.now()}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
    });

    const products = order.items.map((item) => ({
      productId: item.productId._id,
      quantity: item.quantity,
      price: item.price,
    }));

    const payment = await Payment.create({
      userId,
      address: addressId,
      orderId: String(order._id),
      amount: amountInPaise,
      currency: "INR",
      status: "PENDING",
      paymentMethod: "RAZORPAY",
      razorpayOrderId: razorpayOrder.id,
      receipt,
      products,
      rawResponse: razorpayOrder,
    });

    return {
      key: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: "INR",
      razorpayOrderId: razorpayOrder.id,
      appOrderId: order._id,
      paymentId: payment._id,
    };
  }

  static async verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature, appOrderId, userId }) {

    // ✅ Duplicate check — already verified
    const existing = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (existing) {
      if (String(existing.orderId) !== String(appOrderId)) {
        throw new Error("Payment does not belong to this order");
      }
      if (userId && String(existing.userId) !== String(userId)) {
        throw new Error("Payment does not belong to this user");
      }
    }
    if (existing?.status === "SUCCESS") {
      return existing;
    }

    // ✅ Signature verification
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      // ✅ Save payment_id even on failure
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          status: "FAILED",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          failedAt: new Date(),
        }
      );
      throw new Error("Invalid payment signature");
    }

    // ✅ Mark SUCCESS
    const updatedPayment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: "SUCCESS",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      },
      { new: true }
    );

    // ✅ Update Order status
    const orderFilter = { _id: appOrderId };
    if (userId) orderFilter.userId = userId;

    const order = await Order.findOneAndUpdate(
      orderFilter,
      {
        status: "processing",
        paymentStatus: "PAID",
      },
      { new: true }
    );

    if (!order) throw new Error("Order not found");

    return updatedPayment || {
      userId: order.userId,
      orderId: String(order._id),
      amount: Math.round(order.total * 100),
      currency: "INR",
      status: "SUCCESS",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    };
  }
}

module.exports = PaymentService;
