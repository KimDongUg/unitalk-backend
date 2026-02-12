const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const GroupMember = require('../models/GroupMember');
const translationService = require('../services/translationService');
const pushService = require('../services/pushService');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const chatRoomController = {
  async createChatRoom(req, res, next) {
    try {
      const { userId, otherUserId, groupId } = req.validatedBody;

      if (groupId) {
        // Group chat room
        const { conversation, isNew } = await Conversation.findOrCreateForGroup(groupId);
        return res.json({
          success: true,
          chatRoom: {
            id: conversation.id,
            group_id: groupId,
            type: 'group',
            created_at: conversation.created_at,
          },
          isNew,
        });
      }

      // 1:1 chat room
      const { conversation, isNew } = await Conversation.findOrCreate(userId, otherUserId);

      res.json({
        success: true,
        chatRoom: {
          id: conversation.id,
          user1_id: conversation.user1_id,
          user2_id: conversation.user2_id,
          type: 'dm',
          created_at: conversation.created_at,
        },
        isNew,
      });
    } catch (error) {
      next(error);
    }
  },

  async getChatRooms(req, res, next) {
    try {
      const userId = req.params.userId;
      const conversations = await Conversation.findByUserId(userId);

      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          if (conv.type === 'group') {
            return {
              id: conv.id,
              type: 'group',
              group_id: conv.g_id,
              group_name: conv.group_name,
              last_message_at: conv.last_message_at,
            };
          }

          const otherUser = await User.findById(conv.other_user_id);
          const unreadCount = await Message.getUnreadCount(conv.id, userId);

          return {
            id: conv.id,
            type: 'dm',
            other_user: otherUser
              ? {
                  id: otherUser.id,
                  name: otherUser.name,
                  profile_image_url: otherUser.profile_image_url,
                  language_code: otherUser.language_code,
                }
              : null,
            last_message_at: conv.last_message_at,
            unread_count: unreadCount,
          };
        })
      );

      res.json({ success: true, chatRooms: enriched });
    } catch (error) {
      next(error);
    }
  },

  async getMessages(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const page = parseInt(req.validatedQuery.page, 10) || 1;
      const limit = parseInt(req.validatedQuery.limit, 10) || 50;
      const offset = (page - 1) * limit;

      // Check access
      const isParticipant = await Conversation.isParticipant(id, userId);
      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get user language for translation selection
      const user = await User.findById(userId);

      const [messages, total] = await Promise.all([
        Message.findByConversation(id, { limit, offset }),
        Message.countByConversation(id),
      ]);

      // Format messages with appropriate translation
      const formattedMessages = messages.map((msg) => {
        let translatedText = msg.original_text;
        if (msg.translated_texts && msg.translated_texts[user.language_code]) {
          translatedText = msg.translated_texts[user.language_code];
        }

        return {
          id: msg.id,
          sender_id: msg.sender_id,
          original_text: msg.original_text,
          translated_text: translatedText,
          senderLang: msg.sender_language || msg.original_language,
          is_announcement: msg.is_announcement || false,
          created_at: msg.created_at,
          read_at: msg.read_at,
        };
      });

      res.json({
        success: true,
        messages: formattedMessages,
        total,
        page,
        hasMore: page * limit < total,
      });
    } catch (error) {
      next(error);
    }
  },

  async sendMessage(req, res, next) {
    try {
      const { id: conversationId } = req.params;
      const { text, user: senderInfo, senderLang } = req.validatedBody;
      const senderId = senderInfo._id;

      // Verify conversation access
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Chat room not found' });
      }

      const isParticipant = await Conversation.isParticipant(conversationId, senderId);
      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const sender = await User.findById(senderId);
      const translatedTexts = {};

      if (conversation.group_id) {
        // Group message: translate to all member languages
        const languages = await GroupMember.getMemberLanguages(conversation.group_id);
        const translationPromises = languages
          .filter((lang) => lang !== senderLang)
          .map(async (lang) => {
            translatedTexts[lang] = await translationService.translateText(text, lang, senderLang);
          });
        await Promise.all(translationPromises);
      } else {
        // 1:1 message: translate to recipient language
        const recipientId =
          conversation.user1_id === senderId
            ? conversation.user2_id
            : conversation.user1_id;

        const recipient = await User.findById(recipientId);

        if (recipient.language_code && recipient.language_code !== senderLang) {
          translatedTexts[recipient.language_code] =
            await translationService.translateText(text, recipient.language_code, senderLang);
        }
      }

      // Save to database
      const message = await Message.create({
        conversation_id: conversationId,
        sender_id: senderId,
        original_text: text,
        original_language: senderLang,
        translated_texts: translatedTexts,
        sender_language: senderLang,
      });

      // Update conversation last_message_at
      await Conversation.updateLastMessage(conversationId);

      if (conversation.group_id) {
        // Group: broadcast via Socket.io
        const io = req.app.get('io');
        if (io) {
          io.to(`room:${conversationId}`).emit('new_message', {
            message_id: message.id,
            conversation_id: conversationId,
            group_id: conversation.group_id,
            sender_id: senderId,
            sender_name: sender.name,
            original_text: text,
            translated_texts: translatedTexts,
            created_at: message.created_at,
          });
        }
      } else {
        // 1:1: push notification
        const recipientId =
          conversation.user1_id === senderId
            ? conversation.user2_id
            : conversation.user1_id;
        const recipient = await User.findById(recipientId);

        const isOnline = await cacheService.exists(`online:${recipientId}`);
        if (!isOnline && recipient.fcm_token) {
          const recipientText = translatedTexts[recipient.language_code] || text;
          await pushService.sendNotification(recipient.fcm_token, {
            title: sender.name || 'New message',
            body: recipientText,
            data: {
              conversation_id: conversationId,
              sender_id: senderId,
              message_id: message.id,
            },
          });
        }
      }

      logger.info(`Message sent in chatroom ${conversationId}`);
      res.json({
        success: true,
        message: {
          id: message.id,
          conversation_id: conversationId,
          sender_id: senderId,
          original_text: text,
          senderLang,
          translated_texts: translatedTexts,
          created_at: message.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = chatRoomController;
