'use strict';
const express          = require('express');
const router           = express.Router();
const brandController  = require('../controllers/brandController');
const { brandUpload } = require('../config/multer');
const { authMiddleware }  = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');

function withLogoUpload(handler) {
  return (req, res, next) => {
    brandUpload.single('logo')(req, res, (err) => {
      if (err) {
        return res.status(err.status || 400).json({
          success: false,
          error: err.message || 'Logo upload failed',
        });
      }
      return handler(req, res, next);
    });
  };
}

// ─── Public Routes ────────────────────────────────────────────────────────────

// GET /api/brands               → all brands (add ?featured=true for homepage section)
// GET /api/brands/:id           → single brand by ID or slug
// GET /api/brands/:id/products  → all products for a brand
router.get('/',                brandController.getAllBrands);
router.get('/:id',             brandController.getBrandById);
router.get('/:id/products',    brandController.getProductsByBrand);

// ─── Admin-Only Routes ────────────────────────────────────────────────────────

// POST   /api/brands       → create
// PUT    /api/brands/:id   → update
// DELETE /api/brands/:id   → delete
router.post('/',    authMiddleware, adminMiddleware, withLogoUpload(brandController.createBrand));
router.put('/:id',  authMiddleware, adminMiddleware, withLogoUpload(brandController.updateBrand));
router.delete('/:id', authMiddleware, adminMiddleware, brandController.deleteBrand);

module.exports = router;
