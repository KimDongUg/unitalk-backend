const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const translationService = require('../services/translationService');
const logger = require('../utils/logger');

const groupController = {
  async list(req, res, next) {
    try {
      const { universityId, category } = req.validatedQuery;
      const groups = await Group.findByUniversityId(universityId, { category });

      res.json({
        success: true,
        groups,
      });
    } catch (error) {
      next(error);
    }
  },

  async myGroups(req, res, next) {
    try {
      const userId = req.user.id;
      const groups = await Group.findByUserId(userId);

      res.json({
        success: true,
        groups,
      });
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const group = await Group.findById(id);

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const recentMessages = await Group.getRecentMessages(id, 3);

      res.json({
        success: true,
        group,
        recentMessages,
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req, res, next) {
    try {
      const { name, description, universityId, category, isPublic } = req.validatedBody;
      const userId = req.user.id;

      const group = await Group.create({
        university_id: universityId,
        name,
        description,
        category,
        is_public: isPublic,
        created_by: userId,
      });

      // Creator auto-joins as admin
      await GroupMember.join(group.id, userId, 'admin');
      await Group.incrementMemberCount(group.id);

      // Create conversation for the group
      await Conversation.findOrCreateForGroup(group.id);

      logger.info(`Group created: ${group.id} by ${userId}`);
      res.status(201).json({
        success: true,
        group,
      });
    } catch (error) {
      next(error);
    }
  },

  async join(req, res, next) {
    try {
      const { id: groupId } = req.params;
      const userId = req.user.id;

      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const alreadyMember = await GroupMember.isMember(groupId, userId);
      if (alreadyMember) {
        return res.status(409).json({ error: 'Already a member' });
      }

      await GroupMember.join(groupId, userId);
      await Group.incrementMemberCount(groupId);

      // Ensure group conversation exists
      await Conversation.findOrCreateForGroup(groupId);

      logger.info(`User ${userId} joined group ${groupId}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async leave(req, res, next) {
    try {
      const { id: groupId } = req.params;
      const userId = req.user.id;

      const removed = await GroupMember.leave(groupId, userId);
      if (!removed) {
        return res.status(404).json({ error: 'Not a member' });
      }

      await Group.decrementMemberCount(groupId);

      logger.info(`User ${userId} left group ${groupId}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async getMembers(req, res, next) {
    try {
      const { id: groupId } = req.params;
      const members = await GroupMember.getMembers(groupId);

      res.json({
        success: true,
        members,
      });
    } catch (error) {
      next(error);
    }
  },

  async sendAnnouncement(req, res, next) {
    try {
      const { id: groupId } = req.params;
      const { content, senderLang } = req.validatedBody;
      const senderId = req.user.id;

      // Verify membership
      const isMember = await GroupMember.isMember(groupId, senderId);
      if (!isMember) {
        return res.status(403).json({ error: 'Not a group member' });
      }

      // Get all member languages
      const languages = await GroupMember.getMemberLanguages(groupId);

      // Translate to all member languages in parallel
      const translatedTexts = {};
      const translationPromises = languages
        .filter((lang) => lang !== senderLang)
        .map(async (lang) => {
          translatedTexts[lang] = await translationService.translateText(content, lang, senderLang);
        });
      await Promise.all(translationPromises);

      // Get or create group conversation
      const { conversation } = await Conversation.findOrCreateForGroup(groupId);

      // Save announcement message
      const message = await Message.create({
        conversation_id: conversation.id,
        sender_id: senderId,
        original_text: content,
        original_language: senderLang,
        translated_texts: translatedTexts,
        sender_language: senderLang,
      });

      // Mark as announcement
      const { query } = require('../config/database');
      await query(
        `UPDATE messages SET is_announcement = true WHERE id = $1`,
        [message.id]
      );

      await Conversation.updateLastMessage(conversation.id);

      // Broadcast via Socket.io if available
      const io = req.app.get('io');
      if (io) {
        io.to(`room:${conversation.id}`).emit('new_message', {
          message_id: message.id,
          conversation_id: conversation.id,
          group_id: groupId,
          sender_id: senderId,
          original_text: content,
          translated_texts: translatedTexts,
          is_announcement: true,
          created_at: message.created_at,
        });
      }

      logger.info(`Announcement sent in group ${groupId}`);
      res.json({
        success: true,
        message: {
          id: message.id,
          conversation_id: conversation.id,
          original_text: content,
          translated_texts: translatedTexts,
          is_announcement: true,
          created_at: message.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = groupController;
