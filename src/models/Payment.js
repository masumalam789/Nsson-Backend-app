// models/Payment.js
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cartIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Cart" }],
    // Accepts either a saved Address ObjectId or an inline address object
    address: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "CANCELLED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["RAZORPAY", "COD"],
      default: "RAZORPAY",
    },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, index: true, sparse: true },
    razorpaySignature: { type: String },
    receipt: { type: String, index: true },
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    rawWebhookData: { type: mongoose.Schema.Types.Mixed },
    paidAt: { type: Date },
    failedAt: { type: Date },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 3 * 60 * 1000), // 3 minutes
    },
    statusCheckCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);


paymentSchema.methods.isExpired = function () {
  return this.status === "PENDING" && new Date() > this.expiresAt;
};

paymentSchema.virtual("amountInRupees").get(function () {
  return this.amount / 100;
});

paymentSchema.set("toJSON", { virtuals: true });
paymentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Payment", paymentSchema);