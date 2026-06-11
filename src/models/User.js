'use strict';

const mongoose = require('mongoose');
const crypto   = require('crypto');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type:      String,
      required:  true,
      trim:      true,
      minLength: 2,
      maxLength: 50,
    },
    lastName: {
      type:      String,
      required:  true,
      trim:      true,
      minLength: 2,
      maxLength: 50,
    },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
    },
    password: {
      type:     String,
      required: true,
    },
    phone: {
      type:    String,
      default: '',
    },
    deviceTokens: {
      type: [String],
      default: [],
    },
    role: {
      type:    String,
      enum:    ['customer', 'admin'],
      default: 'customer',
    },

    // ── Only exists for customers, never for admins ──────────────────────────
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      // No default here — set in pre('validate') hook only for customers
    },

    shopDetails: {
      shopName:        { type: String },
      gstNumber:       { type: String },
      businessAddress: { type: String },
    },

    resetPasswordToken:   { type: String },
    resetPasswordExpires: { type: Date },
  },
  {
    timestamps: true,
  }
);

// ─── Pre-validate hook ────────────────────────────────────────────────────────

userSchema.pre('validate', async function () {

  if (this.role === 'admin') {
    // Admins must never have a status or shopDetails field
    this.status      = undefined;
    this.shopDetails = undefined;
  }

  if (this.role === 'customer') {
    // Customers always start as pending if no status set
    if (!this.status) {
      this.status = 'pending';
    }

    // Shop details are required for customers
    if (!this.shopDetails?.shopName) {
      this.invalidate('shopDetails.shopName', 'Shop name is required for customers');
    }
    if (!this.shopDetails?.businessAddress) {
      this.invalidate('shopDetails.businessAddress', 'Business address is required for customers');
    }
  }
});

// ─── Virtual: full name ───────────────────────────────────────────────────────

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ─── Method: generate password-reset token ────────────────────────────────────

userSchema.methods.generatePasswordReset = function () {
  this.resetPasswordToken   = crypto.randomBytes(32).toString('hex');
  this.resetPasswordExpires = Date.now() + 3_600_000; // 1 hour
};

// ─── Serialize virtuals ───────────────────────────────────────────────────────

userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
