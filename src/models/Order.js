const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: String,
    price: Number,
    quantity: Number,
    image: String
  }],
  total: {
    type: Number,
    required: true,
    min: 0
  },
  // Accepts either a saved Address ObjectId OR an inline address object
  // (when user enters a new address at checkout without saving it)
  shippingAddress: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  paymentMethod: {
    type: String,
    required: true
  },
  // Payment status - ADD THIS FIELD
  paymentStatus: {
    type: String,
    enum: ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'],
    default: 'UNPAID'
  },
  paymentExpiry: {
    type: Date,
    default: null,
    index: true,
  },
  status: {
    type: String,
    enum: ['awaiting_payment', 'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  trackingNumber: {
    type: String
  },
  cancellationReason: {
    type: String,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelledBy: {
    type: String,
    enum: ['user', 'admin', 'system', null],
    default: null
  },
  couponCode: {
    type: String,
    default: null
  },
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  originalAmountBeforeDiscount: {
    type: Number,
    default: 0
  },
  orderDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);

