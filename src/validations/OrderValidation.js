'use strict';

const { body, param, validationResult } = require('express-validator');

// ─── Reusable error handler ───────────────────────────────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors:  errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
  }
  return next();
};

// ─── Allowed enums (keep in sync with your Order model) ──────────────────────
const ORDER_STATUSES   = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'refunded'];
const PAYMENT_METHODS  = ['card', 'cash_on_delivery', 'wallet', 'cod', 'cash on delivery', 'prepaid', 'razorpay_upi'];

// ─── POST /api/orders ─────────────────────────────────────────────────────────
exports.validateCreateOrder = [
  body('shippingAddress')
    .notEmpty()
    .withMessage('shippingAddress is required')
    .isObject()
    .withMessage('shippingAddress must be an object'),

  body('shippingAddress.fullName')
    .notEmpty()
    .withMessage('shippingAddress.fullName is required')
    .isString()
    .trim(),

  body('shippingAddress.phone')
    .notEmpty()
    .withMessage('shippingAddress.phone is required')
    .isMobilePhone()
    .withMessage('shippingAddress.phone must be a valid phone number'),

  body('shippingAddress.addressLine1')
    .notEmpty()
    .withMessage('shippingAddress.addressLine1 is required')
    .isString()
    .trim(),

  body('shippingAddress.city')
    .notEmpty()
    .withMessage('shippingAddress.city is required')
    .isString()
    .trim(),

  body('shippingAddress.state')
    .notEmpty()
    .withMessage('shippingAddress.state is required')
    .isString()
    .trim(),

  body('shippingAddress.postalCode')
    .notEmpty()
    .withMessage('shippingAddress.postalCode is required')
    .isPostalCode('any')
    .withMessage('shippingAddress.postalCode must be a valid postal code'),

  body('shippingAddress.country')
    .notEmpty()
    .withMessage('shippingAddress.country is required')
    .isISO31661Alpha2()
    .withMessage('shippingAddress.country must be a valid ISO 3166-1 alpha-2 country code (e.g. "US")'),

  body('paymentMethod')
    .notEmpty()
    .withMessage('paymentMethod is required')
    .isString()
    .trim()
    .custom((value) => PAYMENT_METHODS.includes(String(value).toLowerCase()))
    .withMessage(`paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`),

  validate,
];

// ─── PUT /api/orders/admin/:id/status ────────────────────────────────────────
exports.validateUpdateOrderStatus = [
  param('id')
    .isMongoId()
    .withMessage('Order id must be a valid MongoDB ObjectId'),

  body('status')
    .optional()
    .isIn(ORDER_STATUSES)
    .withMessage(`status must be one of: ${ORDER_STATUSES.join(', ')}`),

  body('paymentStatus')
    .optional()
    .custom((value) => PAYMENT_STATUSES.includes(String(value).toLowerCase()))
    .withMessage(`paymentStatus must be one of: ${PAYMENT_STATUSES.join(', ')}`),

  body()
    .custom((_, { req }) => {
      if (!req.body.status && !req.body.paymentStatus) {
        throw new Error('Provide at least one of: status, paymentStatus');
      }
      return true;
    }),

  validate,
];

// ─── Generic MongoId param validator ─────────────────────────────────────────
exports.validateOrderIdParam = [
  param('id')
    .isMongoId()
    .withMessage('Order id must be a valid MongoDB ObjectId'),

  validate,
];
