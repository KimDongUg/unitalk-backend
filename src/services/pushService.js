const admin = require('firebase-admin');
const config = require('../config/env');
const logger = require('../utils/logger');

let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return;

  if (config.firebase.projectId && config.firebase.privateKey && config.firebase.clientEmail) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        privateKey: config.firebase.privateKey,
        clientEmail: config.firebase.clientEmail,
      }),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin initialized');
  } else {
    logger.warn('Firebase credentials not configured, push notifications disabled');
  }
}

const pushService = {
  async sendNotification(fcmToken, { title, body, data }) {
    initFirebase();

    if (!firebaseInitialized || !fcmToken) {
      logger.warn('[DEV] Push notification skipped:', { title, body });
      return;
    }

    try {
      const message = {
        notification: { title, body },
        data: data || {},
        token: fcmToken,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'messages',
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
      };

      const response = await admin.messaging().send(message);
      logger.info(`Push notification sent: ${response}`);
      return response;
    } catch (error) {
      logger.error('Push notification error:', error);
      // Don't throw - push failures shouldn't break the flow
    }
  },
};

module.exports = pushService;
