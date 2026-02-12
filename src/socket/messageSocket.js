const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const translationService = require('../services/translationService');
const pushService = require('../services/pushService');
const cacheService = require('../services/cacheService');
const { query } = require('../config/database');
const logger = require('../utils/logger');

function setupSocket(io) {
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // 1. Authentication (multi-device aware)
    socket.on('authenticate', async (data) => {
      try {
        // Support both string token and {token, deviceType} object
        const token = typeof data === 'string' ? data : data.token;
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id);

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          socket.disconnect();
          return;
        }

        const deviceType = decoded.deviceType || (typeof data === 'object' && data.deviceType) || 'mobile';

        socket.userId = user.id;
        socket.deviceType = deviceType;

        // Join user-level room (all devices)
        socket.join(`user:${user.id}`);
        // Join device-specific room
        socket.join(`user:${user.id}:${deviceType}`);

        // Update device online status with socket ID
        await UserDevice.setOnline(user.id, deviceType, socket.id);

        // Store online status in Redis
        await cacheService.setRaw(`online:${user.id}`, Date.now().toString());

        // Auto-join all group chat rooms
        const groups = await Group.findByUserId(user.id);
        for (const group of groups) {
          const conv = await Conversation.findByGroupId(group.id);
          if (conv) {
            socket.join(`room:${conv.id}`);
          }
        }

        // Notify friends about online status
        const friends = await getUserFriends(user.id);
        for (const friend of friends) {
          io.to(`user:${friend.contact_user_id}`).emit('friend_online', {
            user_id: user.id,
            deviceType,
            timestamp: Date.now(),
          });
        }

        // QR login: join QR token room if PC is waiting
        if (typeof data === 'object' && data.qrToken) {
          socket.join(`qr:${data.qrToken}`);
        }

        socket.emit('authenticated', { success: true, deviceType });
        logger.info(`User authenticated via socket: ${user.id} (${deviceType})`);
      } catch (error) {
        logger.error('Socket auth error:', error);
        socket.emit('error', { message: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // 2. Join room
    socket.on('join_room', async ({ conversation_id }) => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      try {
        const isParticipant = await Conversation.isParticipant(conversation_id, socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(`room:${conversation_id}`);
        socket.emit('room_joined', { conversation_id });
      } catch (error) {
        logger.error('Join room error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // 3. Leave room
    socket.on('leave_room', ({ conversation_id }) => {
      if (!socket.userId) return;
      socket.leave(`room:${conversation_id}`);
      socket.emit('room_left', { conversation_id });
    });

    // 4. Send message (multi-device: broadcasts to all sender's devices too)
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

        const sender = await User.findById(socket.userId);
        const detectedLang = await translationService.detectLanguage(text);
        const translatedTexts = {};

        if (conversation.group_id) {
          // Group message: translate to all member languages
          const languages = await GroupMember.getMemberLanguages(conversation.group_id);
          const translationPromises = languages
            .filter((lang) => lang !== detectedLang)
            .map(async (lang) => {
              translatedTexts[lang] = await translationService.translateText(text, lang, detectedLang);
            });
          await Promise.all(translationPromises);
        } else {
          // 1:1 message
          const recipientId =
            conversation.user1_id === socket.userId
              ? conversation.user2_id
              : conversation.user1_id;

          const recipient = await User.findById(recipientId);

          if (recipient.language_code && recipient.language_code !== detectedLang) {
            translatedTexts[recipient.language_code] =
              await translationService.translateText(text, recipient.language_code, detectedLang);
          }

          if (
            sender.language_code &&
            sender.language_code !== detectedLang &&
            sender.language_code !== recipient.language_code
          ) {
            translatedTexts[sender.language_code] =
              await translationService.translateText(text, sender.language_code, detectedLang);
          }
        }

        // Save to database with source device
        const message = await Message.create({
          conversation_id,
          sender_id: socket.userId,
          original_text: text,
          original_language: detectedLang,
          translated_texts: translatedTexts,
          source_device: socket.deviceType || 'mobile',
        });

        // Update conversation last_message_at
        await Conversation.updateLastMessage(conversation_id);

        // Confirm to sender (this specific socket)
        socket.emit('message_sent', {
          temp_id,
          message_id: message.id,
          created_at: message.created_at,
        });

        const messagePayload = {
          message_id: message.id,
          conversation_id,
          sender_id: socket.userId,
          sender_name: sender.name,
          text,
          original_text: text,
          translated_texts: translatedTexts,
          source_device: socket.deviceType || 'mobile',
          created_at: message.created_at,
        };

        if (conversation.group_id) {
          messagePayload.group_id = conversation.group_id;
          // Group: broadcast to room (all devices in the room get it)
          io.to(`room:${conversation_id}`).emit('new_message', messagePayload);

          // Push notifications to offline group members
          const members = await GroupMember.getMembers(conversation.group_id);
          for (const member of members) {
            if (member.id === socket.userId) continue;
            const hasOnlineDevice = await UserDevice.isAnyDeviceOnline(member.id);
            if (!hasOnlineDevice && member.fcm_token) {
              const memberText = translatedTexts[member.language_code] || text;
              await pushService.sendNotification(member.fcm_token, {
                title: `${sender.name} in group`,
                body: memberText,
                data: {
                  conversation_id,
                  group_id: conversation.group_id,
                  sender_id: socket.userId,
                  message_id: message.id,
                },
              });
            }
          }
        } else {
          // 1:1: send to recipient's all devices + sender's other devices
          const recipientId =
            conversation.user1_id === socket.userId
              ? conversation.user2_id
              : conversation.user1_id;
          const recipient = await User.findById(recipientId);

          const recipientText =
            translatedTexts[recipient.language_code] || text;

          // Send to all recipient devices
          io.to(`user:${recipientId}`).emit('new_message', {
            ...messagePayload,
            text: recipientText,
          });

          // Sync to sender's other devices (exclude current socket)
          socket.to(`user:${socket.userId}`).emit('new_message', messagePayload);

          // Push notification: only if no device is online
          const hasOnlineDevice = await UserDevice.isAnyDeviceOnline(recipientId);
          if (!hasOnlineDevice && recipient.fcm_token) {
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
        }

        logger.info(`Message sent in conversation ${conversation_id} from ${socket.deviceType}`);
      } catch (error) {
        logger.error('Send message error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // 5. Typing indicator
    socket.on('typing', async ({ conversation_id, is_typing }) => {
      if (!socket.userId) return;

      try {
        const conversation = await Conversation.findById(conversation_id);
        if (!conversation) return;

        if (conversation.group_id) {
          // Group: broadcast to room
          socket.to(`room:${conversation_id}`).emit('typing', {
            conversation_id,
            user_id: socket.userId,
            is_typing,
          });
        } else {
          // 1:1: send to other user
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
        }
      } catch (error) {
        logger.error('Typing event error:', error);
      }
    });

    // 6. Mark messages as read (sync across devices)
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

        // Sync read status to user's other devices
        socket.to(`user:${socket.userId}`).emit('messages_read_sync', {
          message_ids,
          read_at: Date.now(),
        });
      } catch (error) {
        logger.error('Mark read error:', error);
      }
    });

    // 7. Start conversation
    socket.on('start_conversation', async ({ user_id }) => {
      if (!socket.userId) return;

      try {
        const { conversation } = await Conversation.findOrCreate(
          socket.userId,
          user_id
        );
        socket.emit('conversation_started', { conversation });
      } catch (error) {
        logger.error('Start conversation error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // 8. Disconnect (multi-device aware)
    socket.on('disconnect', async () => {
      if (socket.userId) {
        // Set this specific device offline
        await UserDevice.setOfflineBySocketId(socket.id);

        // Only remove online status if NO devices are online
        const hasOnlineDevice = await UserDevice.isAnyDeviceOnline(socket.userId);
        if (!hasOnlineDevice) {
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
        }

        logger.info(`User disconnected: ${socket.userId} (${socket.deviceType || 'unknown'})`);
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
