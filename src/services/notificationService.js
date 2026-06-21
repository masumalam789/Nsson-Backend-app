"use strict";

const axios = require("axios");
const Notification = require("../models/Notification");
const User = require("../models/User");

const PUSH_URL = "https://fcm.googleapis.com/fcm/send";

const serializeData = (data = {}) =>
  Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = value == null ? "" : String(value);
    return acc;
  }, {});

async function sendPushToTokens(tokens, payload) {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];

  if (uniqueTokens.length === 0) {
    return {
      attempted: false,
      delivered: false,
      error: "No device tokens registered",
    };
  }

  if (!process.env.FCM_SERVER_KEY) {
    console.log(
      "[NotificationService] Push skipped: FCM_SERVER_KEY is not set",
    );
    return {
      attempted: false,
      delivered: false,
      error: "FCM_SERVER_KEY is not configured",
    };
  }

  try {
    await axios.post(
      PUSH_URL,
      {
        registration_ids: uniqueTokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: serializeData(payload.data),
        priority: "high",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${process.env.FCM_SERVER_KEY}`,
        },
        timeout: 10000,
      },
    );

    return { attempted: true, delivered: true, error: null };
  } catch (error) {
    console.error(
      "[NotificationService] Push error:",
      error.response?.data || error.message,
    );
    return {
      attempted: true,
      delivered: false,
      error: error.response?.data?.error || error.message || "Push send failed",
    };
  }
}

async function createRecordsForUsers(userIds, payload, options = {}) {
  const users = await User.find({
    _id: { $in: userIds },
  }).select("_id deviceTokens status role");

  const activeUsers = users.filter(
    (user) => user.role === "customer" && user.status === "approved",
  );
  if (activeUsers.length === 0) {
    return [];
  }

  const notifications = await Notification.insertMany(
    activeUsers.map((user) => ({
      userId: user._id,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      data: payload.data || {},
      createdBy: options.createdBy || null,
    })),
  );

  await Promise.all(
    notifications.map(async (notification, index) => {
      const user = activeUsers[index];
      const pushResult = await sendPushToTokens(user.deviceTokens, payload);

      notification.pushAttempted = pushResult.attempted;
      notification.pushDelivered = pushResult.delivered;
      notification.pushError = pushResult.error;
      await notification.save();
    }),
  );

  return notifications;
}

exports.notifyUser = async (userId, payload, options = {}) => {
  const notifications = await createRecordsForUsers([userId], payload, options);
  return notifications[0] || null;
};

exports.notifyUsers = async (userIds, payload, options = {}) => {
  return createRecordsForUsers(userIds, payload, options);
};

exports.notifyAllCustomers = async (payload, options = {}) => {
  const users = await User.find({
    role: "customer",
    status: "approved",
  }).select("_id");
  const userIds = users.map((user) => user._id);
  return createRecordsForUsers(userIds, payload, options);
};
