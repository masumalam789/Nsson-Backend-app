"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Category = require("../models/Category");
const { generateUserToken, generateAdminToken } = require("../middleware/auth");
const EmailService = require("../services/emailService");

// ─── Constants ────────────────────────────────────────────────────────────────

const SALT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour in ms
const RESET_TOKEN_EXPIRY_MINUTES = 60;
const MIN_PASSWORD_LENGTH = 8;
const PHONE_REGEX = /^\d{10}$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validatePassword(password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }
  return { valid: true };
}

function validatePhone(phone) {
  if (phone && !PHONE_REGEX.test(phone.trim())) {
    return { valid: false, message: "Phone number must be exactly 10 digits" };
  }
  return { valid: true };
}

// ─── Auth Controllers ─────────────────────────────────────────────────────────

/**
 * POST /auth/login
 * Unified login for customers and admins.
 * Customers must be approved before they can log in.
 */
exports.unifiedLogin = async (req, res) => {
  console.log("LOGIN BODY:", req.body);
  try {
    const { identifier, email, password } = req.body;

    const loginId = identifier || email;

    if (!loginId || !password) {
      return res
        .status(400)
        .json({ error: "identifier and password are required" });
    }

    const user = await User.findOne({
      $or: [{ email: loginId.toLowerCase().trim() }, { phone: loginId.trim() }],
    });

    // Constant-time comparison even when user is not found (prevents timing attacks)
    const dummyHash =
      "$2a$12$invalidhashforcomparison000000000000000000000000000000";
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // ── Block pending / rejected customers ──
    if (user.role !== "admin") {
      if (user.status === "pending") {
        return res.status(403).json({
          error:
            "Your account is pending admin approval. Please wait for approval before logging in.",
        });
      }
      if (user.status === "rejected") {
        return res.status(403).json({
          error: "Your account has been rejected. Please contact support.",
        });
      }
    }

    const isAdmin = user.role === "admin";
    const token = isAdmin
      ? generateAdminToken(user._id.toString())
      : generateUserToken(user._id.toString());

    return res.status(200).json({
      message: "Login successful",
      token,
      user: sanitizeUser(user),
      loginType: isAdmin ? "admin" : "user",
      role: user.role,
    });
  } catch (error) {
    console.error("[Auth] unifiedLogin error:", error);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Register a new customer. Account starts as 'pending' until admin approves.
 */
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      phone,
      address,
      shopDetails,
    } = req.body;

    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      return res.status(400).json({
        error:
          "First name, last name, email, password, and confirm password are required",
      });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (phone) {
      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ error: phoneCheck.message });
      }
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone ? phone.trim() : "",
      address: address ? address.trim() : "",
      role: "customer",
      status: "pending", // ← requires admin approval before login
      shopDetails,
    });

    // Do NOT issue a login token — user must wait for approval
    const emailResult = await EmailService.sendRegistrationReceivedEmail(user);
    if (!emailResult.success) {
      console.error(
        "[Auth] registration received email failed:",
        emailResult.error,
      );
    }

    return res.status(201).json({
      message:
        "Account created successfully. Please wait for admin approval before logging in.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("[Auth] register error:", error);
    return res
      .status(500)
      .json({ error: "Registration failed. Please try again." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /auth/me
 */
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "admin") {
      const [
        totalUsers,
        totalProducts,
        totalOrders,
        totalCategories,
        pendingOrders,
        lowStockProducts,
        pendingUsers,
      ] = await Promise.all([
        User.countDocuments({ role: "customer" }),
        Product.countDocuments(),
        Order.countDocuments(),
        Category.countDocuments(),
        Order.countDocuments({ status: "pending" }),
        Product.countDocuments({ stock: { $lt: 10 } }),
        User.countDocuments({ role: "customer", status: "pending" }),
      ]);

      return res.status(200).json({
        message: "Admin profile retrieved successfully",
        user: sanitizeUser(user),
        stats: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalCategories,
          pendingOrders,
          lowStockProducts,
          pendingUsers,
        },
        role: "admin",
      });
    }

    return res.status(200).json({
      message: "Profile retrieved successfully",
      user: sanitizeUser(user),
      role: user.role,
    });
  } catch (error) {
    console.error("[Auth] getProfile error:", error);
    return res.status(500).json({ error: "Failed to retrieve profile" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /auth/me
 * Update the authenticated user's own profile.
 * Accepts: firstName, lastName, phone, email, address, shopDetails
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      firstName, lastName, phone, email, address,
      shopDetails,                          // nested: { shopName, gstNumber, businessAddress }
      shopName, gstNumber, businessAddress,  // flat alternatives sent by some clients
    } = req.body;

    if (phone) {
      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ error: phoneCheck.message });
      }
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      // Check if email is already taken by another user
      const emailTaken = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: userId },
      });
      if (emailTaken) {
        return res
          .status(409)
          .json({ error: "Email is already in use by another account" });
      }
    }

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined)  updateData.lastName  = lastName.trim();
    if (phone !== undefined)     updateData.phone     = phone.trim();
    if (email !== undefined)     updateData.email     = email.toLowerCase().trim();
    if (address !== undefined)   updateData.address   = address ? address.trim() : "";

    // Accept shopDetails fields from EITHER nested object OR root-level keys
    // Root-level keys (shopName, gstNumber, businessAddress) take priority
    const sn  = shopName        ?? shopDetails?.shopName;
    const gst = gstNumber       ?? shopDetails?.gstNumber;
    const ba  = businessAddress ?? shopDetails?.businessAddress;

    if (sn  !== undefined) updateData['shopDetails.shopName']        = sn.trim();
    if (gst !== undefined) updateData['shopDetails.gstNumber']       = gst.trim();
    if (ba  !== undefined) updateData['shopDetails.businessAddress'] = ba.trim();

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ error: "No valid fields provided for update" });
    }

    // runValidators: false — avoids triggering the full-doc pre-validate hook on partial updates
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { ...updateData, updatedAt: new Date() } },
      { new: true, runValidators: false },
    ).select("-password -resetPasswordToken -resetPasswordExpires");

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("[Auth] updateProfile error:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error:
          "Current password, new password, and confirm password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: "New password must be different from the current password",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await User.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
      updatedAt: new Date(),
    });

    return res.status(200).json({
      message: "Password changed successfully",
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("[Auth] changePassword error:", error);
    return res.status(500).json({ error: "Failed to change password" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/logout
 */
exports.logout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Auth] logout error:", error);
    return res.status(500).json({ success: false, error: "Logout failed" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const genericResponse = {
      message:
        "If an account with that email exists, a password reset link has been sent.",
      note: "Please check your inbox and spam folder. The link expires in 1 hour.",
    };

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashToken(rawToken);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + RESET_TOKEN_EXPIRY_MS;
    await user.save();

    const result = await EmailService.sendForgotPasswordEmail(user, rawToken);

    if (!result.success) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      console.error(
        "[Auth] forgotPassword — email delivery failed:",
        result.error,
      );
      return res.status(500).json({
        error: "Failed to send password reset email. Please try again.",
      });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("[Auth] forgotPassword error:", error);
    return res
      .status(500)
      .json({ error: "Failed to process password reset request" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/reset-password/:token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (!password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "Password and confirm password are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.updatedAt = new Date();

    await user.save();

    return res.status(200).json({
      message:
        "Password reset successfully. You can now log in with your new password.",
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("[Auth] resetPassword error:", error);
    return res.status(500).json({ error: "Failed to reset password" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /auth/verify-reset-token/:token
 */
exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ valid: false, error: "Token is required" });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ valid: false, error: "Invalid or expired reset token" });
    }

    return res
      .status(200)
      .json({ valid: true, message: "Token is valid", email: user.email });
  } catch (error) {
    console.error("[Auth] verifyResetToken error:", error);
    return res
      .status(500)
      .json({ valid: false, error: "Failed to verify reset token" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/register-admin
 * Creates a new admin account (protected by ADMIN_SECRET env var).
 */
exports.registerAdmin = async (req, res) => {
  try {
    const {
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      phone,
      adminSecret,
    } = req.body;

    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Invalid admin secret key" });
    }

    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      return res.status(400).json({
        error:
          "First name, last name, email, password, and confirm password are required",
      });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (phone) {
      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ error: phoneCheck.message });
      }
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone ? phone.trim() : "",
      role: "admin",
      status: "approved", // admins are always approved
    });

    const token = generateAdminToken(user._id.toString());

    return res.status(201).json({
      message: "Admin account created successfully",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("[Auth] registerAdmin error:", error);
    return res
      .status(500)
      .json({ error: "Registration failed. Please try again." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/login-admin
 * Admin-only login endpoint.
 */
exports.loginAdmin = async (req, res) => {
  console.log("🔥 NEW loginAdmin called, body:", req.body);

  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res
        .status(400)
        .json({ error: "Email or phone and password are required" });
    }

    const isEmail = /\S+@\S+\.\S+/.test(emailOrPhone.trim());

    const user = await User.findOne(
      isEmail
        ? { email: emailOrPhone.toLowerCase().trim() }
        : { phone: emailOrPhone.trim() },
    );

    const dummyHash =
      "$2a$12$invalidhashforcomparison000000000000000000000000000000";
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Access denied. Admin accounts only." });
    }

    const token = generateAdminToken(user._id.toString());

    return res.status(200).json({
      message: "Login successful",
      token,
      user: sanitizeUser(user),
      role: "admin",
    });
  } catch (error) {
    console.error("[Auth] loginAdmin error:", error);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};
