"use strict";

const User = require("../models/User");
const Notification = require("../models/Notification")
const app = require("../config/firebase");
const { getMessaging } = require("firebase-admin/messaging");

const messaging = getMessaging(app);

const bulkInsertHelperFunction = async (users, payload, options = {}) => {

  return Notification.insertMany(
    users.map((user) => ({
      userId: user._id,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      data: payload.data || {},
      createdBy: options.createdBy || null,
    })),
  );
}

const sendNotification = async (
  usersIds,
  payload,
  options = {},
  send_push_notification = false,
  send_push_payload = {},
  create_notification_entry = true,
) => {
  // Bail out early if neither action is requested — no point hitting the DB
  if (!create_notification_entry && !send_push_notification) {
    return [];
  }

  const isBroadcast = !usersIds || usersIds.length === 0;

  // Resolve target users: specific IDs, or everyone if broadcasting
  const query = isBroadcast ? {} : { _id: { $in: usersIds } };

  const users = await User.find(query).select("_id fcmToken status role");

  const activeUsers = users.filter((user) => user.role === "customer" && user.status === "approved");

  if (activeUsers.length === 0) {
    return [];
  }

  // 1. Conditionally create DB entries
  let notifications = [];

  if (create_notification_entry) {
    notifications = await bulkInsertHelperFunction(activeUsers, payload, options);
  }

  // 2. Conditionally fire push notifications
  let pushResult = null;

  if (send_push_notification) {
    // Merge: use send_push_payload fields if provided, else fall back to payload
    const pushContent = {
      title: send_push_payload.title ?? payload.title,
      body: send_push_payload.body ?? payload.body,
      data: send_push_payload.data ?? payload.data ?? {},
    };

    if (isBroadcast) {
      pushResult = await sendToTopic("all_user", pushContent);
    } else {
      const tokens = activeUsers.map((u) => u.fcmToken).filter(Boolean);

      if (tokens.length > 0) {
        pushResult = await sendToMultipleDevices(tokens, pushContent);
      }
    }
  }

  return { notifications, pushResult };
};
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
  sendNotification
};
