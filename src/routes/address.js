'use strict';

const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const {
  createAddress,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getAllAddress
} = require('../controllers/addressController');

router.post('/', authMiddleware, createAddress);
router.get('/', authMiddleware, getAllAddress);
router.get('/:id', authMiddleware, getAddressById);
router.put('/:id', authMiddleware, updateAddress);
router.delete('/:id', authMiddleware, deleteAddress);
router.put('/:id/default', authMiddleware, setDefaultAddress);

module.exports = router;