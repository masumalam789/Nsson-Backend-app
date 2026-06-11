'use strict';

const Cart    = require('../models/Cart');
const Product = require('../models/Product');

// ─── Helper ───────────────────────────────────────────────────────────────────
const calcTotal = (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

// ─── GET /api/cart ─────────────────────────────────────────────────────────────
exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate('items.product', 'name images stock price');

    if (!cart) {
      return res.status(200).json({
        success: true,
        data: { items: [], total: 0 },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id:   cart._id,
        items: cart.items,
        total: calcTotal(cart.items),
      },
    });
  } catch (err) {
    console.error('[CartController] getCart:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── POST /api/cart ────────────────────────────────────────────────────────────
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    // Verify product exists and has enough stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} unit(s) available in stock`,
      });
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({
        user:  req.user._id,
        items: [{ product: productId, quantity, price: product.price }],
      });
    } else {
      const existingIndex = cart.items.findIndex(
        (i) => i.product.toString() === productId
      );

      if (existingIndex > -1) {
        const newQty = cart.items[existingIndex].quantity + quantity;
        if (product.stock < newQty) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock} unit(s) available in stock`,
          });
        }
        cart.items[existingIndex].quantity = newQty;
      } else {
        cart.items.push({ product: productId, quantity, price: product.price });
      }

      cart.updatedAt = Date.now();
      await cart.save();
    }

    await cart.populate('items.product', 'name images stock price');

    return res.status(201).json({
      success: true,
      message: 'Item added to cart',
      data: {
        _id:   cart._id,
        items: cart.items,
        total: calcTotal(cart.items),
      },
    });
  } catch (err) {
    console.error('[CartController] addToCart:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── PUT /api/cart/:productId ──────────────────────────────────────────────────
exports.updateCartItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity }  = req.body;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(
      (i) => i.product.toString() === productId
    );
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    if (quantity === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      const product = await Product.findById(productId);
      if (product && product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} unit(s) available in stock`,
        });
      }
      cart.items[itemIndex].quantity = quantity;
    }

    cart.updatedAt = Date.now();
    await cart.save();
    await cart.populate('items.product', 'name images stock price');

    return res.status(200).json({
      success: true,
      message: quantity === 0 ? 'Item removed from cart' : 'Cart updated',
      data: {
        _id:   cart._id,
        items: cart.items,
        total: calcTotal(cart.items),
      },
    });
  } catch (err) {
    console.error('[CartController] updateCartItem:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── DELETE /api/cart/:productId ───────────────────────────────────────────────
exports.removeCartItem = async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const before = cart.items.length;
    cart.items = cart.items.filter((i) => i.product.toString() !== productId);

    if (cart.items.length === before) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    cart.updatedAt = Date.now();
    await cart.save();
    await cart.populate('items.product', 'name images stock price');

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: {
        _id:   cart._id,
        items: cart.items,
        total: calcTotal(cart.items),
      },
    });
  } catch (err) {
    console.error('[CartController] removeCartItem:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── DELETE /api/cart ──────────────────────────────────────────────────────────
exports.clearCart = async (req, res) => {
  try {
    await Cart.findOneAndDelete({ user: req.user._id });

    return res.status(200).json({
      success: true,
      message: 'Cart cleared',
      data: { items: [], total: 0 },
    });
  } catch (err) {
    console.error('[CartController] clearCart:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};