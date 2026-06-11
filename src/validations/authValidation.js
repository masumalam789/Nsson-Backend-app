const validator = require("validator");

const validateRegister = (req, res, next) => {
  const { email, password, confirmPassword, firstName, lastName, phone } = req.body;
  const errors = [];

  // First Name
  if (!firstName || !firstName.trim()) {
    errors.push("First name is required");
  } else if (firstName.trim().length < 2) {
    errors.push("First name must be at least 2 characters long");
  } else if (firstName.trim().length > 50) {
    errors.push("First name must be less than 50 characters");
  }

  // Last Name
  if (!lastName || !lastName.trim()) {
    errors.push("Last name is required");
  } else if (lastName.trim().length < 2) {
    errors.push("Last name must be at least 2 characters long");
  } else if (lastName.trim().length > 50) {
    errors.push("Last name must be less than 50 characters");
  }

  // Email
  if (!email || !email.trim()) {
    errors.push("Email is required");
  } else if (!validator.isEmail(email)) {
    errors.push("Invalid email format");
  }

  // Password
  const passwordValid = password && password.length >= 8 && password.length <= 128;
  if (!password) {
    errors.push("Password is required");
  } else if (password.length < 8) {                        // fixed: 6 → 8 minimum
    errors.push("Password must be at least 8 characters long");
  } else if (password.length > 128) {                      // fixed: added max to prevent bcrypt DoS
    errors.push("Password must be less than 128 characters");
  } else if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {  // fixed: require letter + number minimum
    errors.push("Password must contain at least one letter and one number");
  }

  // Confirm Password — fixed: only check if password itself was valid
  if (passwordValid) {
    if (!confirmPassword) {
      errors.push("Confirm password is required");
    } else if (password !== confirmPassword) {
      errors.push("Passwords do not match");
    }
  }

  // Phone (optional)
  if (phone && phone.trim()) {
    const digitsOnly = phone.trim().replace(/[\s\-]/g, ""); // fixed: strip spaces/dashes before testing
    if (!/^\d{10}$/.test(digitsOnly)) {
      errors.push("Phone number must be exactly 10 digits");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  // fixed: sanitize before passing to controller so controllers get clean data
  req.body.email = email.trim().toLowerCase();
  req.body.firstName = firstName.trim();
  req.body.lastName = lastName.trim();
  if (phone) req.body.phone = phone.trim().replace(/[\s\-]/g, "");

  next();
};

const validateLogin = (req, res, next) => {
   console.log('VALIDATE LOGIN BODY:', req.body);
  const { emailOrPhone, password } = req.body;  // ✅ must be emailOrPhone
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
// fixed: implemented instead of empty passthrough
const validateUpdateProfile = (req, res, next) => {
  const { firstName, lastName, phone } = req.body;
  const errors = [];

  if (firstName !== undefined) {
    if (!firstName.trim()) {
      errors.push("First name cannot be empty");
    } else if (firstName.trim().length < 2) {
      errors.push("First name must be at least 2 characters long");
    } else if (firstName.trim().length > 50) {
      errors.push("First name must be less than 50 characters");
    }
  }

  if (lastName !== undefined) {
    if (!lastName.trim()) {
      errors.push("Last name cannot be empty");
    } else if (lastName.trim().length < 2) {
      errors.push("Last name must be at least 2 characters long");
    } else if (lastName.trim().length > 50) {
      errors.push("Last name must be less than 50 characters");
    }
  }

  if (phone !== undefined && phone.trim()) {
    const digitsOnly = phone.trim().replace(/[\s\-]/g, "");
    if (!/^\d{10}$/.test(digitsOnly)) {
      errors.push("Phone number must be exactly 10 digits");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  if (firstName) req.body.firstName = firstName.trim();
  if (lastName) req.body.lastName = lastName.trim();
  if (phone) req.body.phone = phone.trim().replace(/[\s\-]/g, "");

  next();
};

// fixed: implemented instead of empty passthrough
const validateChangePassword = (req, res, next) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const errors = [];

  if (!currentPassword) {
    errors.push("Current password is required");
  }

  const newPasswordValid = newPassword && newPassword.length >= 8 && newPassword.length <= 128;

  if (!newPassword) {
    errors.push("New password is required");
  } else if (newPassword.length < 8) {
    errors.push("New password must be at least 8 characters long");
  } else if (newPassword.length > 128) {
    errors.push("New password must be less than 128 characters");
  } else if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(newPassword)) {
    errors.push("New password must contain at least one letter and one number");
  } else if (currentPassword && newPassword === currentPassword) {
    errors.push("New password must be different from current password");
  }

  if (newPasswordValid) {
    if (!confirmNewPassword) {
      errors.push("Confirm new password is required");
    } else if (newPassword !== confirmNewPassword) {
      errors.push("New passwords do not match");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
};