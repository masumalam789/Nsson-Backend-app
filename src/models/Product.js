const mongoose = require("mongoose");

const compatibilitySchema = new mongoose.Schema({
  brand: {
    type: String,
    required: true,
  },
  model: {
    type: String,
    required: true,
  },
  yearFrom: Number,
  yearTo: Number,
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    category: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
    },
    partNumber: {
      type: String,
      required: true,
      unique: true,
    },
    price: {
      type: Number,
      required: true,
    },
    mrp: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    warrantyMonths: {
      type: Number,
      default: 0,
    },
    compatibility: {
      type: [compatibilitySchema],
      default: [],
    },
    specifications: {
      type: Map,
      of: mongoose.Schema.Types.Mixed, // allows strings, numbers, booleans
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },  // so finalPrice appears in API responses
    toObject: { virtuals: true },
  }
);

// Index for filtering by bike brand/model
productSchema.index({ "compatibility.brand": 1, "compatibility.model": 1 });

productSchema.virtual("finalPrice").get(function () {
  return this.price - (this.price * this.discount) / 100;
});

module.exports = mongoose.model("Product", productSchema);