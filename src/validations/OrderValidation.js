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
const PAYMENT_METHODS  = ['cash_on_delivery', 'razorpay_upi'];

// ─── POST /api/orders ─────────────────────────────────────────────────────────
exports.validateCreateOrder = [
  
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
