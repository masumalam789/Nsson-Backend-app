'use strict';

const app = require('../config/firebase');
const { getMessaging } = require('firebase-admin/messaging');

const messaging = getMessaging(app);

// ─── Send to single device ────────────────────────────────────────────────────
const sendToDevice = async (fcmToken, { title, body, data = {} }) => {
  if (!fcmToken) return null;

  try {
    const result = await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    console.log(
      `✅ Notification sent to ${fcmToken.slice(0, 10)}...`,
      result
    );

    return result;
  } catch (err) {
    console.error('❌ Failed to send notification:', err.message);
    return null;
  }
};

// ─── Send to multiple devices ─────────────────────────────────────────────────
const sendToMultipleDevices = async (
  fcmTokens,
  { title, body, data = {} }
) => {
  if (!fcmTokens?.length) return null;

  const chunks = [];

  for (let i = 0; i < fcmTokens.length; i += 500) {
    chunks.push(fcmTokens.slice(i, i + 500));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      })
    )
  );

  results.forEach((result, chunkIndex) => {
    result.responses.forEach((response, index) => {
      if (!response.success) {
        console.error(
          `❌ Token ${chunks[chunkIndex][index].slice(0, 10)}... failed:`,
          response.error?.message
        );
      }
    });
  });

  const totalSuccess = results.reduce(
    (sum, result) => sum + result.successCount,
    0
  );

  const totalFailure = results.reduce(
    (sum, result) => sum + result.failureCount,
    0
  );

  console.log(`✅ Sent: ${totalSuccess}, ❌ Failed: ${totalFailure}`);

  return results;
};

// ─── Send to a user ───────────────────────────────────────────────────────────
const sendToUser = async (user, notification) => {
  const tokens = [
    ...(user.deviceTokens || []),
    ...(user.fcmToken ? [user.fcmToken] : []),
  ].filter(Boolean);

  if (!tokens.length) {
    console.log(`No FCM tokens for user ${user._id}`);
    return null;
  }

  return sendToMultipleDevices(tokens, notification);
};

module.exports = {
  sendToDevice,
  sendToMultipleDevices,
  sendToUser,
};