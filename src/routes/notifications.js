'use strict';

const express = require('express');
const router = express.Router();

const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');

router.get('/', authMiddleware, notificationController.getMyNotifications);
router.post('/register-token', authMiddleware, notificationController.registerDeviceToken);
router.post('/unregister-token', authMiddleware, notificationController.unregisterDeviceToken);
router.patch('/read-all', authMiddleware, notificationController.markAllNotificationsRead);
router.patch('/:id/read', authMiddleware, notificationController.markNotificationRead);

router.post('/broadcast', adminMiddleware, notificationController.broadcastAnnouncement);

module.exports = router;
