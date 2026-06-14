const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require("../middleware/admin");
const { productUpload } = require("../config/multer"); // ✅ from centralized config

// ─── Public routes ────────────────────────────────────────────────────────────
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);
router.get("/:productId/:variantId", productController.getProductWithVariant);

// ─── Admin routes ─────────────────────────────────────────────────────────────
router.post("/", authMiddleware, adminMiddleware, productUpload.array("images", 8), productController.createProduct);
router.post("/bulk-import", authMiddleware, adminMiddleware, productController.bulkImportProducts);
router.put("/:id", authMiddleware, adminMiddleware, productUpload.array("images", 8), productController.updateProduct);
router.delete("/:id", authMiddleware, adminMiddleware, productController.deleteProduct);

// ─── Variant routes ───────────────────────────────────────────────────────────
router.post("/:productId/variants", authMiddleware, adminMiddleware, productUpload.fields([{ name: "images", maxCount: 6 }]), productController.addVariant);
router.put("/:productId/variants/:variantId", authMiddleware, adminMiddleware, productUpload.fields([{ name: "images", maxCount: 6 }]), productController.updateVariant);
router.delete("/:productId/variants/:variantId", authMiddleware, adminMiddleware, productController.deleteVariant);

// ─── Size routes ──────────────────────────────────────────────────────────────
router.post("/:productId/:variantId", authMiddleware, adminMiddleware, productController.addSizeToVariant);

module.exports = router;