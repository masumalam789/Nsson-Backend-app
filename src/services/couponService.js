'use strict';

const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const UserCoupon = require('../models/UserCoupon');

const getEffectivePerUserLimit = (coupon) => {
  if (coupon.couponType === 'public') return 1;
  return coupon.per_user_limit ?? 1;
};

const getUserUsageCount = (coupon, userId) => {
  if (!userId || !coupon.used_users?.length) return 0;
  const userIdStr = userId.toString();
  const entry = coupon.used_users.find(
    (u) => u.user_id && u.user_id.toString() === userIdStr
  );
  return entry?.usage_count || 0;
};

/**
 * Validate a coupon and calculate discount amount.
 * @param {string} code        - The coupon code to apply.
 * @param {number} orderAmount - The order subtotal amount.
 * @param {string} [userId]    - Required for private coupons — ownership is checked.
 * @returns {Promise<{coupon, discountAmount, finalAmount}>}
 */
exports.validateAndCalculate = async (code, orderAmount, userId = null) => {
  if (!code) {
    throw new Error('Coupon code is required');
  }

  const normalizedCode = code.trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: normalizedCode });

  if (!coupon) {
    throw new Error('Coupon not found');
  }

  if (!coupon.isActive) {
    throw new Error('Coupon is inactive');
  }

  const now = new Date();
  if (coupon.startDate && now < new Date(coupon.startDate)) {
    throw new Error('Coupon has not started yet');
  }
  if (coupon.endDate && now > new Date(coupon.endDate)) {
    throw new Error('Coupon has expired');
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    throw new Error('Coupon usage limit has been reached');
  }

  if (orderAmount < coupon.minOrderAmount) {
    throw new Error(
      `Minimum order amount of ₹${coupon.minOrderAmount} is required to use this coupon`
    );
  }

  // ── Private coupon ownership check ──────────────────────────────────────────
  if (coupon.couponType === 'private') {
    if (!userId) {
      throw new Error('This coupon is only available to specific users');
    }
    const assignment = await UserCoupon.findOne({
      userId,
      couponId: coupon._id,
    });
    if (!assignment) {
      throw new Error('This coupon is not available for your account');
    }
  }

  // ── Per-user usage limit ─────────────────────────────────────────────────────
  if (userId) {
    const perUserLimit = getEffectivePerUserLimit(coupon);
    const userUsageCount = getUserUsageCount(coupon, userId);
    if (userUsageCount >= perUserLimit) {
      throw new Error('You have reached the usage limit for this coupon');
    }
  }

  // ── Discount calculation ─────────────────────────────────────────────────────
  let discountAmount = 0;
  if (coupon.discountType === 'percentage') {
    discountAmount = (orderAmount * coupon.discountValue) / 100;
    if (
      coupon.maxDiscountAmount !== null &&
      coupon.maxDiscountAmount !== undefined
    ) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
    }
  } else if (coupon.discountType === 'flat') {
    discountAmount = coupon.discountValue;
  }

  // Safety: discount never negative and never exceeds order amount
  discountAmount = Math.max(0, Math.min(discountAmount, orderAmount));
  const finalAmount = orderAmount - discountAmount;

  return {
    coupon,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalAmount: parseFloat(finalAmount.toFixed(2)),
  };
};

/**
 * Record coupon usage after a successful order.
 */
exports.recordCouponUsage = async (couponId, userId) => {
  if (!couponId || !userId) return;

  const userObjectId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  const updated = await Coupon.findOneAndUpdate(
    { _id: couponId, 'used_users.user_id': userObjectId },
    {
      $inc: { usedCount: 1, 'used_users.$.usage_count': 1 },
    },
    { new: true }
  );

  if (!updated) {
    await Coupon.findByIdAndUpdate(couponId, {
      $inc: { usedCount: 1 },
      $push: { used_users: { user_id: userObjectId, usage_count: 1 } },
    });
  }
};

/**
 * Roll back coupon usage when an order is cancelled or payment expires.
 */
exports.rollbackCouponUsage = async (couponId, userId) => {
  if (!couponId) return;

  if (userId) {
    const userObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const updated = await Coupon.findOneAndUpdate(
      {
        _id: couponId,
        'used_users.user_id': userObjectId,
        'used_users.usage_count': { $gt: 0 },
      },
      {
        $inc: { usedCount: -1, 'used_users.$.usage_count': -1 },
      },
      { new: true }
    );

    if (updated) return;
  }

  await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: -1 } });
};

exports.getEffectivePerUserLimit = getEffectivePerUserLimit;
exports.getUserUsageCount = getUserUsageCount;
