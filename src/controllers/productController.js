const Product = require("../models/Product");
const notificationService = require("../services/notificationService");
const path = require("path");
const { deleteFile: deleteProductImage } = require("../config/productUpload");
const { deleteFile } = require("../config/multer")

// const { v4: uuid } = require("uuid");
const fileUpload = require("../config/multer");

const getPublicBaseUrl = (req) => {
  const configuredBase = process.env.BASE_URL;
  if (configuredBase) return configuredBase.replace(/\/+$/, "");

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
};

const toPublicUrl = (req, imagePath) => {
  if (!imagePath) return "";
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const normalized = String(imagePath).startsWith("/") ? imagePath : `/${imagePath}`;
  return `${getPublicBaseUrl(req)}${normalized}`;
};

const serializeProduct = (req, product) => {
  const obj = typeof product.toObject === "function" ? product.toObject() : { ...product };
  obj.images = (obj.images || []).filter(Boolean).map((imagePath) => toPublicUrl(req, imagePath));
  obj.imageUrl = obj.images[0] || "";
  return obj;
};

const normalizeBodyImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  if (typeof images === "string") {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_err) {
      return images.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const uploadedImagePaths = (files = []) =>
  files.map((file) => `/uploads/products/${file.filename}`);

exports.createProduct = async (req, res) => {
  try {
    const {
      name, description, category, brand, partNumber,
      price, discount, stock, warrantyMonths,
      compatibility, specifications,
    } = req.body;

    if (!name || !category || !brand || !partNumber || price === undefined) {
      req.files?.forEach((f) => deleteFile(f.path)); // ✅ fire and forget
      return res.status(400).json({
        success: false,
        message: "Name, category, brand, partNumber, and price are required",
      });
    }

    const urls = (req.files || []).map((file) => file.path);

    const product = await Product.create({
      name, description, category, brand, partNumber,
      price,
      discount:       discount || 0,
      stock:          stock || 0,
      warrantyMonths: warrantyMonths || 0,
      compatibility:  compatibility || [],
      specifications: specifications || {},
      images:         urls,
    });

    await notificationService.notifyAllCustomers(
      {
        title: "New Products Added",
        body:  `${product.brand} parts now available. Check the catalog.`,
        category: "info",
        data: { productId: product._id, name: product.name, brand: product.brand },
      },
      { createdBy: req.user?._id || null }
    );

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: serializeProduct(req, product),
    });
  } catch (error) {
    req.files?.forEach((f) => deleteFile(f.path)); // ✅ fire and forget
    res.status(500).json({ error: error.message });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const { color, size, category } = req.query;

    const filter = {};

    if (category) filter.category = category;

    // fixed: query against actual schema path variants[].color
    if (color) filter["variants.color"] = color.toLowerCase();

    if (size) filter["variants.sizes.size"] = size.toUpperCase();

    const products = await Product.find(filter);

    res.json({
      success: true,
      total: products.length,
      products: products.map((product) => serializeProduct(req, product)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      message: "Product retrieved successfully",
      product: serializeProduct(req, product),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve product" });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const {
      name, description, category, subcategory, brand, partNumber,
      price, discount, stock, warrantyMonths,
      compatibility, specifications,
      existingImages, removeImages,
    } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      req.files?.forEach((f) => deleteFile(f.path)); // ✅ fire and forget
      return res.status(404).json({ message: "Product not found", success: false });
    }

    if (name           !== undefined) product.name           = name;
    if (description    !== undefined) product.description    = description;
    if (category       !== undefined) product.category       = category;
    if (subcategory    !== undefined) product.subcategory    = subcategory;
    if (brand          !== undefined) product.brand          = brand;
    if (partNumber     !== undefined) product.partNumber     = partNumber;
    if (price          !== undefined) product.price          = Number(price);
    if (stock          !== undefined) product.stock          = Number(stock);
    if (discount       !== undefined) product.discount       = Number(discount);
    if (warrantyMonths !== undefined) product.warrantyMonths = Number(warrantyMonths);
    if (compatibility  !== undefined) product.compatibility  = Array.isArray(compatibility) ? compatibility : JSON.parse(compatibility || "[]");
    if (specifications !== undefined) product.specifications = typeof specifications === "string" ? JSON.parse(specifications || "{}") : specifications;

    const removedUrls = normalizeBodyImages(removeImages);
    removedUrls.forEach((url) => deleteFile(url)); // ✅ fire and forget

    const keptImages = existingImages !== undefined
      ? normalizeBodyImages(existingImages)
      : product.images.filter((img) => !removedUrls.includes(img));

    const newImages = (req.files || []).map((f) => f.path);

    if (req.files?.length || existingImages !== undefined || removedUrls.length) {
      product.images = [...keptImages, ...newImages];
    }

    await product.save();

    if (discount !== undefined && Number(discount) > 0) {
      await notificationService.notifyAllCustomers(
        {
          title: "Special Offer",
          body:  `${Number(discount)}% off on ${product.name}. Limited time!`,
          category: "discount",
          data: { productId: product._id, discount: product.discount, targetName: product.name },
        },
        { createdBy: req.user?._id || null }
      );
    }

    res.status(200).json({
      message: "Product updated successfully",
      product: serializeProduct(req, product),
      success: true,
    });
  } catch (error) {
    req.files?.forEach((f) => deleteFile(f.path)); // ✅ fire and forget
    res.status(500).json({ message: "Failed to update product", success: false });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found", success: false });
    }

    await Product.findByIdAndDelete(id);

    product.images?.forEach((url) => deleteFile(url));

    res.status(200).json({
      message: "Product deleted successfully",
      deletedProduct: { id: product._id, name: product.name },
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete product", success: false });
  }
};

exports.addVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const { color } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const normalizedColor = color.toLowerCase().trim();

    const exists = product.variants.some((v) => v.color === normalizedColor);
    if (exists) {
      return res.status(400).json({ error: "Variant color already exists" });
    }

    const images = req.files?.images || [];
    const uploaded = await Promise.all(
      images.map((file) => fileUpload(file.buffer.toString("base64"), uuid()))
    );

    product.variants.push({
      color: normalizedColor,
      images: uploaded.map((i) => i.url),
      sizes: [],
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: "Variant added successfully",
      variants: product.variants,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    const { color, removedImages } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const variant = product.variants.id(variantId);
    if (!variant) return res.status(404).json({ error: "Variant not found" });

    if (color) {
      const newColor = color.toLowerCase().trim();
      const exists = product.variants.some(
        (v) => v._id.toString() !== variantId && v.color === newColor
      );
      if (exists) {
        return res.status(400).json({ error: "Variant color already exists" });
      }
      variant.color = newColor;
    }

    if (removedImages) {
      const removed = Array.isArray(removedImages) ? removedImages : [removedImages];
      variant.images = variant.images.filter((img) => !removed.includes(img));
    }

    if (req.files?.images?.length) {
      const uploaded = await Promise.all(
        req.files.images.map((file) =>
          fileUpload(file.buffer.toString("base64"), uuid())
        )
      );
      variant.images.push(...uploaded.map((i) => i.url));
    }

    await product.save();

    res.status(200).json({
      message: "Variant updated successfully",
      variant,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    const product = await Product.findByIdAndUpdate(
      productId,
      { $pull: { variants: { _id: variantId } } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Variant deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete variant",
    });
  }
};

exports.getProductWithVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    const product = await Product.findOne(
      { _id: productId, "variants._id": variantId },
      { name: 1, description: 1, category: 1, subcategory: 1, "variants.$": 1 }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product or variant not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
      variant: product.variants[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.addSizeToVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    const { size, stock, price, discount } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const variant = product.variants.id(variantId);
    if (!variant) return res.status(404).json({ error: "Variant not found" });

    const normalizedSize = size.toUpperCase(); // fixed: normalize before saving

    const exists = variant.sizes.some((s) => s.size === normalizedSize);
    if (exists) {
      return res.status(400).json({ error: "Size already exists for this variant" });
    }

    variant.sizes.push({
      size: normalizedSize, // fixed: was pushing raw `size`
      stock: Number(stock),
      price: Number(price),
      discount: Number(discount) || 0,
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: "Size added successfully",
      variant,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.bulkImportProducts = async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "products array is required",
      });
    }

    const sanitizedProducts = products.map((product) => ({
      name: product.name,
      description: product.description || "",
      category: product.category,
      brand: product.brand,
      partNumber: product.partNumber,
      price: product.price,
      discount: product.discount || 0,
      stock: product.stock || 0,
      warrantyMonths: product.warrantyMonths || 0,
      compatibility: product.compatibility || [],
      specifications: product.specifications || {},
      images: product.images || [],
    }));

    const insertedProducts = await Product.insertMany(sanitizedProducts, { ordered: false });

    await notificationService.notifyAllCustomers(
      {
        title: "New Products Added",
        body: `${insertedProducts[0]?.brand || "New"} parts now available. Check the catalog.`,
        category: "info",
        data: {
          count: insertedProducts.length,
          brand: insertedProducts[0]?.brand || "",
        },
      },
      { createdBy: req.user?._id || null }
    );

    return res.status(201).json({
      success: true,
      message: `${insertedProducts.length} products imported successfully`,
      products: insertedProducts.map((product) => serializeProduct(req, product)),
    });
  } catch (error) {
    console.error("[Product] bulkImportProducts error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to import products" });
  }
};
