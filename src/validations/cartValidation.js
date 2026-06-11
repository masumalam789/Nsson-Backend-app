'use strict';

const { body, param, validationResult } = require('express-validator');

// ─── Reusable error handler ───────────────────────────────────────────────────
/**
 * Place this at the END of any validation chain.
 * If there are errors it short-circuits with 422 and a structured errors array.
 */
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

// ─── Validation chains ────────────────────────────────────────────────────────

/**
 * POST /api/cart
 * Body: { productId, quantity }
 */
exports.validateAddToCart = [
  body('productId')
    .notEmpty()
    .withMessage('productId is required')
    .isMongoId()
    .withMessage('productId must be a valid MongoDB ObjectId'),

  body('quantity')
    .notEmpty()
    .withMessage('quantity is required')
    .isInt({ min: 1 })
    .withMessage('quantity must be a positive integer'),

  validate,
];

/**
 * PUT /api/cart/:productId
 * Params: productId
 * Body:   { quantity }
 */
exports.validateUpdateCartItem = [
  param('productId')
    .isMongoId()
    .withMessage('productId param must be a valid MongoDB ObjectId'),

  body('quantity')
    .notEmpty()
    .withMessage('quantity is required')
    .isInt({ min: 0 })
    .withMessage('quantity must be 0 (remove) or a positive integer'),

  validate,
];

/**
 * DELETE /api/cart/:productId
 * Params: productId
 */
exports.validateProductIdParam = [
  param('productId')
    .isMongoId()
    .withMessage('productId param must be a valid MongoDB ObjectId'),

  validate,
];