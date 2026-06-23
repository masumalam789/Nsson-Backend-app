'use strict';

const express            = require('express');
const router             = express.Router();
const userController     = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware} = require('../middleware/admin');

// ─── Admin Only ───────────────────────────────────────────────────────────────
router.get('/',       authMiddleware, adminMiddleware, userController.getAllUsers);
router.get('/:id',    authMiddleware, adminMiddleware, userController.getUserById);
router.patch('/:id/approve', authMiddleware, adminMiddleware, userController.approveUser);
router.patch('/:id/reject',  authMiddleware, adminMiddleware, userController.rejectUser);
router.patch('/:id/approval', authMiddleware, adminMiddleware, userController.updateUserApproval);
router.put('/admin/profile', authMiddleware, adminMiddleware, userController.updateAdminProfile);
router.put('/:id',    authMiddleware, adminMiddleware, userController.updateUser);
router.delete('/:id', authMiddleware, adminMiddleware, userController.deleteUser);

module.exports = router;
