"use strict";

const User = require("../models/User");
const app = require("../config/firebase");
const { getMessaging } = require("firebase-admin/messaging");

const messaging = getMessaging(app);

export const insertNotificationsForUsers = async (userIds, payload, options = {}) => {
  const users = await User.find({
    _id: { $in: userIds },
  }).select("_id deviceTokens status role");

  const activeUsers = users.filter(
    (user) => user.role === "customer" && user.status === "approved",
  );

  if (activeUsers.length === 0) {
    return [];
  }

  return Notification.insertMany(
    activeUsers.map((user) => ({
      userId: user._id,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      data: payload.data || {},
      createdBy: options.createdBy || null,
    })),
  );
}

/**
 * Send notification to a single device
 */

const sendToUser = async (userId, { title, body, data = {} }) => {
  try {
    const user = await User.findById(userId, "fcmToken");

    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return null;
    }

    if (!user.fcmToken) {
      console.log(`❌ No FCM token found for user ${userId}`);
      return null;
    }

    const response = await messaging.send({
      token: user.fcmToken,
      notification: {
        title,
        body,
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: "high",
        notification: {
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    console.log(`✅ Notification sent to user ${userId}`, response);

    return response;
  } catch (error) {
    console.error("❌ FCM Error:", error.message);

    return null;
  }
};

/**
 * Send notification to multiple tokens
 */
const sendToMultipleDevices = async (tokens, { title, body, data = {} }) => {
  try {
    if (!tokens?.length) return null;

    const chunks = [];

    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    const responses = [];

    for (const chunk of chunks) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title,
          body,
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)]),
        ),
        android: {
          priority: "high",
          notification: {
            sound: "default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      });

      responses.push(response);
    }

    const success = responses.reduce((sum, r) => sum + r.successCount, 0);

    const failed = responses.reduce((sum, r) => sum + r.failureCount, 0);

    console.log(`✅ Notifications Sent: ${success}, Failed: ${failed}`);

    return responses;
  } catch (error) {
    console.error("❌ Broadcast Error:", error.message);
    return null;
  }
};

const sendToTopic = async (topic, { title, body, data = {} }) => {
  try {
    const response = await messaging.send({
      topic,
      notification: {
        title,
        body,
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: "high",
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    console.log(`✅ Topic notification sent to ${topic}`, response);

    return response;
  } catch (error) {
    console.error("❌ Topic notification failed:", error.message);

    return null;
  }
};

module.exports = {
  sendToUser,
  sendToMultipleDevices,
  sendToTopic,
};
