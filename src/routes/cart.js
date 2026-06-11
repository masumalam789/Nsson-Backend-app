'use strict';

const express = require('express');
const router  = express.Router();

// ✅ match whatever your middleware file actually exports
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require('../controllers/cartController');
const { validateAddToCart, validateUpdateCartItem, validateProductIdParam } = require('../validations/cartValidation');



// ─── Routes ───────────────────────────────────────────────────────────────────
router.get   ('/',           authMiddleware,                              getCart);
router.post  ('/',           authMiddleware, validateAddToCart,           addToCart);
router.put   ('/:productId', authMiddleware, validateUpdateCartItem,      updateCartItem);
router.delete('/:productId', authMiddleware, validateProductIdParam,      removeCartItem);
router.delete('/',           authMiddleware,                              clearCart);

module.exports = router;