'use strict';

const express            = require('express');
const router             = express.Router();
const categoryController = require('../controllers/categoryController');
const { authMiddleware } = require('../middleware/auth');   // FIX: destructure
const { adminMiddleware} = require('../middleware/admin');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/',             categoryController.getCategories);
router.get('/:id',          categoryController.getCategoryById);
router.get('/:id/products', categoryController.getProductsByCategory);

// ─── Admin Only ───────────────────────────────────────────────────────────────
router.post('/',      authMiddleware, adminMiddleware, categoryController.createCategory);
router.put('/:id',    authMiddleware, adminMiddleware, categoryController.updateCategory);
router.delete('/:id', authMiddleware, adminMiddleware, categoryController.deleteCategory);

module.exports = router;