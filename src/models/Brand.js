'use strict';

const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    logo: {
      type: String,
      default: '',
    },
    logoPublicId: {
      type: String,
      default: '',
    },
    featured: {
      type: Boolean,
      default: false,
    },
    vehicleTypes: {
      type: [String],
      default: [],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// NO pre save hook — slug is generated in the controller

module.exports = mongoose.model('Brand', BrandSchema);
