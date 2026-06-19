"use strict";

const app = require("../config/firebase");
const { getMessaging } = require("firebase-admin/messaging");

const messaging = getMessaging(app);

/**
 * Send notification to a single device
 */
const sendToDevice = async (token, { title, body, data = {} }) => {
  try {
    if (!token) return null;

    const response = await messaging.send({
      token,
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

    console.log("✅ Notification sent:", response);

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
  sendToDevice,
  sendToMultipleDevices,
  sendToTopic,
};

