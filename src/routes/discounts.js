'use strict';

const express = require('express');
const router = express.Router();

const discountController = require('../controllers/discountController');
const { adminMiddleware } = require('../middleware/admin');

router.get('/', discountController.getDiscounts);
router.post('/', adminMiddleware, discountController.createDiscount);

module.exports = router;
