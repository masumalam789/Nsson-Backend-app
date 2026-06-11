const Category = require("../models/Category"); // fixed: import from model directly
const Product = require("../models/Product");   // fixed: import from model directly

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.aggregate([
      {
        $lookup: {
          from: "products",
          let: { catName: "$name" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [{ $toLower: "$category" }, { $toLower: "$$catName" }]
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

    res.json({ success: true, message: "Categories fetched", total: categories.length, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({
      message: "Category retrieved successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve category" });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const category = await Category.create({
      name: name.trim(),
      description: description || "",
    });

    res.status(201).json({
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create category" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description }, // fixed: removed manual updatedAt, timestamps handles it
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update category" });
  }
};

exports.getProductsByCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    const products = await Product.find({ category: category.name });

    res.json({
      message: "Products retrieved successfully",
      category: {
        _id: category._id,
        name: category.name,
        description: category.description,
      },
      products,
      total: products.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve products" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // fixed: restored safety check — prevent orphaning products
    const productsCount = await Product.countDocuments({ category: category.name });
    if (productsCount > 0) {
      return res.status(400).json({
        error: "Cannot delete category that has products",
        productsCount,
        suggestion: "Reassign or delete the products first",
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({
      message: "Category deleted successfully",
      deletedCategory: category,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete category" });
  }
};