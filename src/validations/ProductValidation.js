const validator = require("validator");

const validateCreateProduct = (req, res, next) => {
  const { name, description, price, category, stock, sizes, colors, images } = req.body;
  const errors = [];

  // Name
  if (!name || !name.trim()) {
    errors.push("Product name is required");
  } else if (name.trim().length < 3) {
    errors.push("Product name must be at least 3 characters long");
  } else if (name.trim().length > 200) {
    errors.push("Product name must not exceed 200 characters");
  }

  // Description (optional)
  if (description && description.length > 2000) {
    errors.push("Description must not exceed 2000 characters");
  }

  // Price
  if (price === undefined || price === null) {
    errors.push("Price is required");
  } else if (typeof price !== "number") {
    errors.push("Price must be a number");
  } else if (price <= 0) {                              // fixed: 0 price is invalid
    errors.push("Price must be greater than 0");
  } else if (price > 1000000) {
    errors.push("Price cannot exceed 1,000,000");
  } else if (!/^\d+(\.\d{1,2})?$/.test(price.toString())) {
    errors.push("Price can have at most 2 decimal places");
  }

  // Category
  if (!category || !category.trim()) {
    errors.push("Category is required");
  } else if (category.trim().length < 2) {
    errors.push("Category must be at least 2 characters long");
  } else if (category.trim().length > 100) {
    errors.push("Category must not exceed 100 characters");
  }

  // Stock
  if (stock === undefined || stock === null) {
    errors.push("Stock is required");
  } else if (!Number.isInteger(stock)) {
    errors.push("Stock must be an integer");
  } else if (stock < 0) {
    errors.push("Stock cannot be negative");
  } else if (stock > 100000) {
    errors.push("Stock cannot exceed 100,000");
  }

  // Sizes
  if (!Array.isArray(sizes) || sizes.length === 0) {
    errors.push("Sizes must be a non-empty array");
  } else {
    const validSizes = ["XS", "S", "M", "L", "XL", "XXL"];
    sizes.forEach((size) => {                           // fixed: removed unused index
      if (!validSizes.includes(size.toUpperCase())) {
        errors.push(`Size "${size}" is not valid. Must be one of: ${validSizes.join(", ")}`);
      }
    });
  }

  // Colors
  if (!Array.isArray(colors) || colors.length === 0) {
    errors.push("Colors must be a non-empty array");
  } else {
    colors.forEach((color, index) => {
      if (typeof color !== "string" || !color.trim()) {
        errors.push(`Color at index ${index} must be a non-empty string`);
      }
    });
  }

  // Images (optional)
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push("Images must be an array");
    } else if (images.length > 10) {
      errors.push("Cannot upload more than 10 images");
    } else {
      images.forEach((img, index) => {
        if (typeof img !== "string") {
          errors.push(`Image ${index + 1} must be a string (URL)`);
        } else if (!validator.isURL(img, { protocols: ["http", "https"], require_protocol: true })) {
          errors.push(`Image ${index + 1} must be a valid URL`);
        }
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  // fixed: sanitize before passing to controller
  req.body.name = name.trim();
  req.body.category = category.trim();
  if (description) req.body.description = description.trim();
  if (sizes) req.body.sizes = sizes.map((s) => s.toUpperCase());
  if (colors) req.body.colors = colors.map((c) => c.toLowerCase().trim());

  next();
};

const validateUpdateProduct = (req, res, next) => {
  const { name, description, price, category, stock, sizes, colors, images } = req.body;
  const errors = [];

  if (
    name === undefined && description === undefined && price === undefined &&
    category === undefined && stock === undefined && sizes === undefined &&
    colors === undefined && images === undefined
  ) {
    return res.status(400).json({ error: "At least one field must be provided for update" });
  }

  if (name !== undefined) {
    if (!name.trim()) {
      errors.push("Product name cannot be empty");
    } else if (name.trim().length < 3) {
      errors.push("Product name must be at least 3 characters long");
    } else if (name.trim().length > 200) {
      errors.push("Product name must not exceed 200 characters");
    }
  }

  if (description !== undefined && description.length > 2000) {
    errors.push("Description must not exceed 2000 characters");
  }

  if (price !== undefined) {
    if (typeof price !== "number") {
      errors.push("Price must be a number");
    } else if (price <= 0) {                            // fixed: consistent with create
      errors.push("Price must be greater than 0");
    } else if (price > 1000000) {
      errors.push("Price cannot exceed 1,000,000");
    } else if (!/^\d+(\.\d{1,2})?$/.test(price.toString())) {
      errors.push("Price can have at most 2 decimal places");
    }
  }

  if (category !== undefined) {
    if (!category.trim()) {
      errors.push("Category cannot be empty");
    } else if (category.trim().length < 2) {
      errors.push("Category must be at least 2 characters long");
    } else if (category.trim().length > 100) {
      errors.push("Category must not exceed 100 characters");
    }
  }

  if (stock !== undefined) {
    if (!Number.isInteger(stock)) {
      errors.push("Stock must be an integer");
    } else if (stock < 0) {
      errors.push("Stock cannot be negative");
    } else if (stock > 100000) {
      errors.push("Stock cannot exceed 100,000");
    }
  }

  // fixed: sizes validation was completely missing from update
  if (sizes !== undefined) {
    if (!Array.isArray(sizes) || sizes.length === 0) {
      errors.push("Sizes must be a non-empty array");
    } else {
      const validSizes = ["XS", "S", "M", "L", "XL", "XXL"];
      sizes.forEach((size) => {
        if (!validSizes.includes(size.toUpperCase())) {
          errors.push(`Size "${size}" is not valid. Must be one of: ${validSizes.join(", ")}`);
        }
      });
    }
  }

  // fixed: colors validation was completely missing from update
  if (colors !== undefined) {
    if (!Array.isArray(colors) || colors.length === 0) {
      errors.push("Colors must be a non-empty array");
    } else {
      colors.forEach((color, index) => {
        if (typeof color !== "string" || !color.trim()) {
          errors.push(`Color at index ${index} must be a non-empty string`);
        }
      });
    }
  }

  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push("Images must be an array");
    } else if (images.length > 10) {
      errors.push("Cannot upload more than 10 images");
    } else {
      images.forEach((img, index) => {
        if (typeof img !== "string") {
          errors.push(`Image ${index + 1} must be a string (URL)`);
        } else if (!validator.isURL(img, { protocols: ["http", "https"], require_protocol: true })) {
          errors.push(`Image ${index + 1} must be a valid URL`);
        }
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  // fixed: sanitize before passing to controller
  if (name) req.body.name = name.trim();
  if (category) req.body.category = category.trim();
  if (description) req.body.description = description.trim();
  if (sizes) req.body.sizes = sizes.map((s) => s.toUpperCase());
  if (colors) req.body.colors = colors.map((c) => c.toLowerCase().trim());

  next();
};

// fixed: removed mongoose import, use validator.isMongoId consistently
const validateProductId = (req, res, next) => {
  const { id } = req.params;

  if (!id || !validator.isMongoId(id)) {
    return res.status(400).json({ error: "Invalid product ID format" });
  }

  next();
};

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
  validateProductId,
};