"use strict";

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const userController = require("../controllers/userController");
const { authMiddleware } = require("../middleware/auth");
const { adminMiddleware } = require("../middleware/admin");

console.log("✅ Auth routes loading");

// ─── Public Routes ────────────────────────────────────────────────────────────

router.post("/register", authController.register);
router.post("/register-admin", authController.registerAdmin);
router.post("/login", authController.unifiedLogin);
router.post("/login-admin", authController.loginAdmin);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);
router.get("/verify-reset-token/:token", authController.verifyResetToken);

// ─── Admin: User Approval Routes ──────────────────────────────────────────────
// NOTE: /users/pending must come BEFORE /:id routes to avoid Express
//       matching "users" as an :id param.

router.get(
  "/users/pending",
  authMiddleware,
  adminMiddleware,
  userController.getPendingUsers,
);
router.patch(
  "/:id/approve",
  authMiddleware,
  adminMiddleware,
  userController.approveUser,
);
router.patch(
  "/:id/reject",
  authMiddleware,
  adminMiddleware,
  userController.rejectUser,
);

// ─── Protected Routes (any authenticated user) ───────────────────────────────

router.post("/user/fcm-token", authMiddleware, authController.saveFcmToken);
router.get("/me", authMiddleware, authController.getProfile);
router.put("/me", authMiddleware, authController.updateProfile);
router.post("/change-password", authMiddleware, authController.changePassword);
router.post("/logout", authMiddleware, authController.logout);

module.exports = router;

