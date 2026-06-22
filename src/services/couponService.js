'use strict';

const Coupon = require('../models/Coupon');
const UserCoupon = require('../models/UserCoupon');

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
