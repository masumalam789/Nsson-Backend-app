'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

// ─── Token Generators ─────────────────────────────────────────────────────────

const generateUserToken = (userId) => {
  return jwt.sign({ id: userId, type: 'user' }, JWT_SECRET, { expiresIn: '24h' });
};

// FIX: was missing — authController imports this
const generateAdminToken = (userId) => {
  return jwt.sign({ id: userId, type: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
};

const verifyUserToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

// ─── Auth Middleware (customers) ─────────────────────────────────────────────

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided.' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user    = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found.' });
    }

    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token has expired.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
    return res.status(500).json({ success: false, error: 'Authentication failed.' });
  }
};

module.exports = {
  authMiddleware,
  generateUserToken,
  generateAdminToken,   // FIX: now exported
  verifyUserToken,
};