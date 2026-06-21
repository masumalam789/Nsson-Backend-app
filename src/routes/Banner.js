const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");

const {
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  updateBannerStatus,
  deleteBanner,
  deleteBannerImage,
  getActiveBanner,
  getUserBanner,
} = require("../controllers/BannerController");

const { upload } = require("../config/multer");

// ─────────────────────────────────────────────────────────────────────────────
//  All routes mounted under /api/banners
//
//  GET    /api/banners                ← list all (filter: status, position, live)
//  GET    /api/banners/:id            ← single banner
//  POST   /api/banners                ← create  (multipart/form-data)
//  PUT    /api/banners/:id            ← update  (multipart/form-data)
//  PATCH  /api/banners/:id/status     ← toggle active / inactive
//  DELETE /api/banners/:id            ← delete banner + image file
//  DELETE /api/banners/:id/image      ← remove image only, keep record
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin", getAllBanners);
router.get("/", getUserBanner);
router.get("/active", authMiddleware, getActiveBanner);
router.get("/:id", getBannerById);

router.post("/", upload.single("image"), createBanner);
router.put("/:id", upload.single("image"), updateBanner);

router.patch("/:id/status", updateBannerStatus);

router.delete("/:id", deleteBanner);
router.delete("/:id/image", deleteBannerImage);

// user routes

module.exports = router;
