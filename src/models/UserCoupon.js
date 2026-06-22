'use strict';

const mongoose = require('mongoose');

/**
 * Tracks private coupon assignments made by admin to specific users.
 * Used to validate that a private coupon can only be applied by the user it was given to.
 */
const userCouponSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate assignments for the same user + coupon pair
userCouponSchema.index({ userId: 1, couponId: 1 }, { unique: true });

module.exports = mongoose.model('UserCoupon', userCouponSchema);
