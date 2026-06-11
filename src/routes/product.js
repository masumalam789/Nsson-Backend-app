const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require("../middleware/admin"); // ← destructure
const { upload: productUpload } = require("../config/productUpload");
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

// console.log("step 1");

// console.log("step 2");

// console.log("step 3");
// console.log("step 4");
// console.log("step 5");

// console.log("step 6 - authMiddleware:", authMiddleware);
// console.log("step 7 - adminMiddleware:", adminMiddleware);




router.get("/", productController.getAllProducts);
router.get("/:id", productController.getProductById);
router.get("/:productId/:variantId", productController.getProductWithVariant);

// Admin routes
router.post("/", authMiddleware, adminMiddleware, productUpload.array("images", 8), productController.createProduct);
router.post("/bulk-import", authMiddleware, adminMiddleware, productController.bulkImportProducts);
router.put("/:id", authMiddleware, adminMiddleware, productUpload.array("images", 8), productController.updateProduct);
router.delete("/:id", authMiddleware, adminMiddleware, productController.deleteProduct);

// Variant routes
router.post("/:productId/variants", authMiddleware, adminMiddleware, upload.fields([{ name: "images", maxCount: 6 }]), productController.addVariant);
router.put("/:productId/variants/:variantId", authMiddleware, adminMiddleware, upload.fields([{ name: "images", maxCount: 6 }]), productController.updateVariant);
router.delete("/:productId/variants/:variantId", authMiddleware, adminMiddleware, productController.deleteVariant);

// Size routes
router.post("/:productId/:variantId", authMiddleware, adminMiddleware, productController.addSizeToVariant);

module.exports = router;
