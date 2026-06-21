'use strict';

const express = require('express');
const router  = express.Router();

const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createCoupon } = require('../controllers/couponController');


// ─── Routes ───────────────────────────────────────────────────────────────────
router.post  ('/', authMiddleware, createCoupon);

module.exports = router;