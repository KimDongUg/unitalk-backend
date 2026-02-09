const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const logger = require('../utils/logger');

const messageController = {
  async getMessages(req, res, next) {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;

      // Check access
      const isParticipant = await Conversation.isParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get user language for translation selection
      const user = await User.findById(userId);

      const [messages, total] = await Promise.all([
        Message.findByConversation(conversationId, { limit, offset }),
        Message.countByConversation(conversationId),
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
          created_at: msg.created_at,
          read_at: msg.read_at,
        };
      });

      res.json({
        messages: formattedMessages,
        total,
        has_more: offset + limit < total,
      });
    } catch (error) {
      next(error);
    }
  },

  async markAsRead(req, res, next) {
    try {
      const { message_ids } = req.validatedBody;

      await Message.markAsRead(message_ids);

      logger.info(`Messages marked as read: ${message_ids.length}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async getConversations(req, res, next) {
    try {
      const userId = req.user.id;
      const conversations = await Conversation.findByUserId(userId);

      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          const otherUser = await User.findById(conv.other_user_id);
          const unreadCount = await Message.getUnreadCount(conv.id, userId);

          return {
            id: conv.id,
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

      res.json({ conversations: enriched });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = messageController;
