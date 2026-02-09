const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const translationService = require('../services/translationService');
const pushService = require('../services/pushService');
const cacheService = require('../services/cacheService');
const { query } = require('../config/database');
const logger = require('../utils/logger');

function setupSocket(io) {
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // 1. Authentication
    socket.on('authenticate', async (token) => {
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id);

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          socket.disconnect();
          return;
        }

        socket.userId = user.id;
        socket.join(`user:${user.id}`);

        // Store online status in Redis
        await cacheService.setRaw(`online:${user.id}`, Date.now().toString());

        // Notify friends about online status
        const friends = await getUserFriends(user.id);
        for (const friend of friends) {
          io.to(`user:${friend.contact_user_id}`).emit('friend_online', {
            user_id: user.id,
            timestamp: Date.now(),
          });
        }

        socket.emit('authenticated', { success: true });
        logger.info(`User authenticated via socket: ${user.id}`);
      } catch (error) {
        logger.error('Socket auth error:', error);
        socket.emit('error', { message: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // 2. Send message
    socket.on('send_message', async (data) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { conversation_id, text, temp_id } = data;

      try {
        // Verify conversation access
        const conversation = await Conversation.findById(conversation_id);
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = await Conversation.isParticipant(
          conversation_id,
          socket.userId
        );
        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Determine recipient
        const recipientId =
          conversation.user1_id === socket.userId
            ? conversation.user2_id
            : conversation.user1_id;

        const recipient = await User.findById(recipientId);
        const sender = await User.findById(socket.userId);

        // Detect source language and translate
        const detectedLang = await translationService.detectLanguage(text);
        const translatedTexts = {};

        if (recipient.language_code && recipient.language_code !== detectedLang) {
          translatedTexts[recipient.language_code] =
            await translationService.translateText(text, recipient.language_code, detectedLang);
        }

        // Also translate to sender's language if different
        if (
          sender.language_code &&
          sender.language_code !== detectedLang &&
          sender.language_code !== recipient.language_code
        ) {
          translatedTexts[sender.language_code] =
            await translationService.translateText(text, sender.language_code, detectedLang);
        }

        // Save to database
        const message = await Message.create({
          conversation_id,
          sender_id: socket.userId,
          original_text: text,
          original_language: detectedLang,
          translated_texts: translatedTexts,
        });

        // Update conversation last_message_at
        await Conversation.updateLastMessage(conversation_id);

        // Confirm to sender
        socket.emit('message_sent', {
          temp_id,
          message_id: message.id,
          created_at: message.created_at,
        });

        // Send to recipient
        const recipientText =
          translatedTexts[recipient.language_code] || text;

        io.to(`user:${recipientId}`).emit('new_message', {
          message_id: message.id,
          conversation_id,
          sender_id: socket.userId,
          sender_name: sender.name,
          text: recipientText,
          original_text: text,
          created_at: message.created_at,
        });

        // Push notification if recipient is offline
        const isOnline = await cacheService.exists(`online:${recipientId}`);
        if (!isOnline && recipient.fcm_token) {
          await pushService.sendNotification(recipient.fcm_token, {
            title: sender.name || 'New message',
            body: recipientText,
            data: {
              conversation_id,
              sender_id: socket.userId,
              message_id: message.id,
            },
          });
        }

        logger.info(`Message sent in conversation ${conversation_id}`);
      } catch (error) {
        logger.error('Send message error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // 3. Typing indicator
    socket.on('typing', async ({ conversation_id, is_typing }) => {
      if (!socket.userId) return;

      try {
        const recipientId = await Conversation.getOtherUserId(
          conversation_id,
          socket.userId
        );
        if (recipientId) {
          io.to(`user:${recipientId}`).emit('typing', {
            conversation_id,
            user_id: socket.userId,
            is_typing,
          });
        }
      } catch (error) {
        logger.error('Typing event error:', error);
      }
    });

    // 4. Mark messages as read
    socket.on('mark_read', async ({ message_ids }) => {
      if (!socket.userId) return;

      try {
        await Message.markAsRead(message_ids);

        // Notify senders
        const messages = await Message.findByIds(message_ids);
        const senderIds = [...new Set(messages.map((m) => m.sender_id))];

        for (const senderId of senderIds) {
          const senderMessageIds = messages
            .filter((m) => m.sender_id === senderId)
            .map((m) => m.id);

          io.to(`user:${senderId}`).emit('messages_read', {
            message_ids: senderMessageIds,
            read_by: socket.userId,
            read_at: Date.now(),
          });
        }
      } catch (error) {
        logger.error('Mark read error:', error);
      }
    });

    // 5. Start conversation
    socket.on('start_conversation', async ({ user_id }) => {
      if (!socket.userId) return;

      try {
        const conversation = await Conversation.findOrCreate(
          socket.userId,
          user_id
        );
        socket.emit('conversation_started', { conversation });
      } catch (error) {
        logger.error('Start conversation error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // 6. Disconnect
    socket.on('disconnect', async () => {
      if (socket.userId) {
        // Remove online status
        await cacheService.del(`online:${socket.userId}`);

        // Store last seen
        await cacheService.setRaw(
          `lastseen:${socket.userId}`,
          new Date().toISOString()
        );

        // Notify friends about offline status
        const friends = await getUserFriends(socket.userId);
        for (const friend of friends) {
          io.to(`user:${friend.contact_user_id}`).emit('friend_offline', {
            user_id: socket.userId,
            last_seen: Date.now(),
          });
        }

        logger.info(`User disconnected: ${socket.userId}`);
      }
    });
  });
}

async function getUserFriends(userId) {
  const result = await query(
    `SELECT contact_user_id FROM contacts WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
}

module.exports = setupSocket;
