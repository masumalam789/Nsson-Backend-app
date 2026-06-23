'use strict';

const Notification = require('../models/Notification');
const User = require('../models/User');
const notificationService = require('../services/notificationService');

exports.getMyNotifications = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ userId: req.user._id }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      notifications,
    });
  } catch (error) {
    console.error('[Notification] getMyNotifications error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    return res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error('[Notification] markNotificationRead error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('[Notification] markAllNotificationsRead error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const result = await Notification.deleteOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('[Notification] deleteNotification error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
};

exports.clearNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ userId: req.user._id });

    return res.status(200).json({
      success: true,
      message: 'All notifications deleted',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('[Notification] clearNotifications error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete notifications' });
  }
};

exports.registerDeviceToken = async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Device token is required' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { deviceTokens: token },
    });

    return res.status(200).json({ success: true, message: 'Device token registered' });
  } catch (error) {
    console.error('[Notification] registerDeviceToken error:', error);
    return res.status(500).json({ success: false, error: 'Failed to register device token' });
  }
};

exports.unregisterDeviceToken = async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Device token is required' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { deviceTokens: token },
    });

    return res.status(200).json({ success: true, message: 'Device token removed' });
  } catch (error) {
    console.error('[Notification] unregisterDeviceToken error:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove device token' });
  }
};

exports.broadcastAnnouncement = async (req, res) => {
  try {
    const body = String(req.body.body || req.body.message || '').trim();
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];
    const data = req.body.data && typeof req.body.data === 'object' ? req.body.data : {};

    if (!body) {
      return res.status(400).json({ success: false, error: 'Announcement message is required' });
    }

    const payload = {
      title: 'Announcement',
      body,
      category: 'info',
      data,
    };

    const notifications = userIds.length
      ? await notificationService.notifyUsers(userIds, payload, { createdBy: req.user._id })
      : await notificationService.notifyAllCustomers(payload, { createdBy: req.user._id });

    return res.status(200).json({
      success: true,
      message: 'Announcement sent successfully',
      count: notifications.length,
    });
  } catch (error) {
    console.error('[Notification] broadcastAnnouncement error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send announcement' });
  }
};
