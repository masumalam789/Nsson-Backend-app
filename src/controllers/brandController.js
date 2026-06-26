'use strict';

const Brand   = require('../models/Brand');
const Product = require('../models/Product');
const { deleteFile, buildUrl } = require('../config/multer');

// Helper to generate slug
function makeSlug(name) {
  return name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const serializeBrand = (_req, brand) => {
  const obj = typeof brand.toObject === "function" ? brand.toObject() : { ...brand };
  if (obj.logo) {
    obj.logo = buildUrl(obj.logo);
  } else if (obj.logoPublicId) {
    obj.logo = buildUrl(obj.logoPublicId);
  }
  return obj;
};

const serializeBrands = (req, brands) => brands.map((brand) => serializeBrand(req, brand));

// ─── GET /api/brands ──────────────────────────────────────────────────────────
exports.getAllBrands = async (req, res) => {
    try {
    const brands = await Brand.aggregate([
      {
        $lookup: {
          from: "products",
          let: { brandName: "$name" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toLower: "$brand" }, { $toLower: "$$brandName" }]
                }
              }
            }
          ],
          as: "linkedProducts",
        },
      },
      { $addFields: { productCount: { $size: "$linkedProducts" } } },
      { $project: { linkedProducts: 0 } },
      { $sort: { createdAt: -1 } },
    ]);

    res.json({ success: true, message: "Brands fetched", total: brands.length, brands: serializeBrands(req, brands) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// ─── GET /api/brands/:id ──────────────────────────────────────────────────────
exports.getBrandById = async (req, res) => {
  try {
    const { id } = req.params;
    const brand = await Brand.findOne({
      $or: [
        ...(id.match(/^[a-f\d]{24}$/i) ? [{ _id: id }] : []),
        { slug: id },
      ],
    });

    if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
    return res.json({ success: true, brand: serializeBrand(req, brand) });
  } catch (error) {
    console.error('[Brand] getBrandById error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve brand' });
  }
};

// ─── GET /api/brands/:id/products ─────────────────────────────────────────────
exports.getProductsByBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

    const products = await Product.find({ brand: brand.name }).sort({ createdAt: -1 });
    return res.json({ success: true, brand: serializeBrand(req, brand), products, total: products.length });
  } catch (error) {
    console.error('[Brand] getProductsByBrand error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve products' });
  }
};

// ─── POST /api/brands ─────────────────────────────────────────────────────────
exports.createBrand = async (req, res) => {
  try {
    const { name, description, featured, vehicleTypes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Brand name is required' });
    }

    const existing = await Brand.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });
    if (existing) return res.status(409).json({ success: false, error: 'Brand already exists' });

    const logo = req.file ? req.file.path : (req.body.logo || '');
    const logoPublicId = req.file?.filename || '';
    const slug = makeSlug(name);

    const brand = await Brand.create({
      name:         name.trim(),
      description:  description?.trim() || '',
      logo,
      logoPublicId,
      slug,
      featured:     featured === true || featured === 'true',
      vehicleTypes: Array.isArray(vehicleTypes) ? vehicleTypes : [],
    });

    return res.status(201).json({ success: true, message: 'Brand created successfully', brand: serializeBrand(req, brand) });
  } catch (error) {
    if (req.file?.path) deleteFile(req.file.path);
    console.error('[Brand] createBrand error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create brand' });
  }
};

// ─── PUT /api/brands/:id ──────────────────────────────────────────────────────
exports.updateBrand = async (req, res) => {
  try {
    const { name, description, featured, vehicleTypes } = req.body;
    const existingBrand = await Brand.findById(req.params.id);

    if (!existingBrand) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }

    const updateData = {};
    if (name         !== undefined) { updateData.name = name.trim(); updateData.slug = makeSlug(name); }
    if (description  !== undefined) updateData.description  = description.trim();
    if (featured     !== undefined) updateData.featured      = featured === true || featured === 'true';
    if (vehicleTypes !== undefined) updateData.vehicleTypes  = Array.isArray(vehicleTypes) ? vehicleTypes : [];
    if (req.file) {
      updateData.logo = req.file.path;
      updateData.logoPublicId = req.file.filename;
      if (existingBrand.logoPublicId) deleteFile(existingBrand.logoPublicId);
      else if (existingBrand.logo) deleteFile(existingBrand.logo);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields provided' });
    }

    const brand = await Brand.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    return res.json({ success: true, message: 'Brand updated successfully', brand: serializeBrand(req, brand) });
  } catch (error) {
    if (req.file?.path) deleteFile(req.file.path);
    console.error('[Brand] updateBrand error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update brand' });
  }
};

// ─── DELETE /api/brands/:id ───────────────────────────────────────────────────
exports.deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

    const productsCount = await Product.countDocuments({ brand: brand.name });
    if (productsCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete brand that has products',
        productsCount,
        suggestion: 'Reassign or delete the products first',
      });
    }

    if (brand.logoPublicId) {
      deleteFile(brand.logoPublicId);
    } else if (brand.logo) {
      deleteFile(brand.logo);
    }

    await Brand.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Brand deleted successfully', deletedBrand: brand });
  } catch (error) {
    console.error('[Brand] deleteBrand error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete brand' });
  }
};
