const validator = require('validator');

// Register Validation - UPDATED with firstName/lastName
const validateRegister = (req, res, next) => {
  console.log('🎯 USING NEW VALIDATION: firstName/lastName');
  const { email, password, confirmPassword, firstName, lastName, phone } = req.body;
  const errors = [];

  // First Name validation
  if (!firstName || !firstName.trim()) {
    errors.push('First name is required');
  } else if (firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters long');
  }

  // Last Name validation
  if (!lastName || !lastName.trim()) {
    errors.push('Last name is required');
  } else if (lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters long');
  }

  // Email validation
  if (!email || !email.trim()) {
    errors.push('Email is required');
  } else if (!validator.isEmail(email)) {
    errors.push('Invalid email format');
  }

  // Password validation
  if (!password) {
    errors.push('Password is required');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }

  // Confirm Password validation
  if (!confirmPassword) {
    errors.push('Confirm password is required');
  } else if (password !== confirmPassword) {
    errors.push('Password and confirm password do not match');
  }

  // Phone validation (optional)
  if (phone && phone.trim()) {
    if (!/^\d{10}$/.test(phone.trim())) {
      errors.push('Phone number must be exactly 10 digits');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Login Validation
const validateLogin = (req, res, next) => {
  const { emailOrPhone, password } = req.body;
  const errors = [];

  if (!emailOrPhone || !emailOrPhone.trim()) {
    errors.push('Email or phone is required');
  } else {
    const isEmail = validator.isEmail(emailOrPhone.trim());
    const isPhone = /^\d{10}$/.test(emailOrPhone.trim());
    if (!isEmail && !isPhone) {
      errors.push('Enter a valid email or 10-digit phone number');
    }
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  next();
};

// Simple bypass for other validations for now
const validateUpdateProfile = (req, res, next) => next();
const validateChangePassword = (req, res, next) => next();

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword
};
