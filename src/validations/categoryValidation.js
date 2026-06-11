const validator = require("validator");

const validateCategoryId = (req, res, next) => {
  const { id } = req.params;

  if (!id || !validator.isMongoId(id)) {
    return res.status(400).json({ error: "Invalid category ID format" });
  }

  next();
};

const validateCreateCategory = (req, res, next) => {
  const { name, description } = req.body;
  const errors = [];

  if (!name || !name.trim()) {
    errors.push("Category name is required");
  } else if (name.trim().length < 2) {
    errors.push("Category name must be at least 2 characters long");
  } else if (name.trim().length > 50) {
    errors.push("Category name must not exceed 50 characters");
  }

  if (description && description.length > 500) {
    errors.push("Description must not exceed 500 characters");
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  // fixed: sanitize before passing to controller
  req.body.name = name.trim();
  if (description) req.body.description = description.trim();

  next();
};

const validateUpdateCategory = (req, res, next) => {
  const { name, description } = req.body;
  const errors = [];

  // fixed: use === undefined instead of !name so empty string "" goes to name validation not here
  if (name === undefined && description === undefined) {
    return res.status(400).json({
      error: "At least one field (name or description) must be provided for update",
    });
  }

  if (name !== undefined) {
    if (!name.trim()) {
      errors.push("Category name cannot be empty");
    } else if (name.trim().length < 2) {
      errors.push("Category name must be at least 2 characters long");
    } else if (name.trim().length > 50) {
      errors.push("Category name must not exceed 50 characters");
    }
  }

  if (description !== undefined && description.length > 500) {
    errors.push("Description must not exceed 500 characters");
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  // fixed: sanitize before passing to controller
  if (name) req.body.name = name.trim();
  if (description) req.body.description = description.trim();

  next();
};

module.exports = {
  validateCategoryId,
  validateCreateCategory,
  validateUpdateCategory,
};