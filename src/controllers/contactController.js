const { query } = require('../config/database');
const User = require('../models/User');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const contactController = {
  async syncContacts(req, res, next) {
    try {
      const { userId, phoneHashes } = req.validatedBody;

      // Find matching users in DB using pre-hashed phone numbers
      const matchedUsers = await User.findByPhoneHashes(phoneHashes);

      // Filter out the requesting user
      const friends = matchedUsers.filter((u) => u.id !== userId);

      // Upsert contact relationships
      for (const friend of friends) {
        await query(
          `INSERT INTO contacts (user_id, contact_user_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, contact_user_id) DO NOTHING`,
          [userId, friend.id]
        );
      }

      // Enrich with online status
      const enrichedFriends = await Promise.all(
        friends.map(async (friend) => {
          const isOnline = await cacheService.exists(`online:${friend.id}`);
          const lastSeen = await cacheService.getRaw(`lastseen:${friend.id}`);
          return {
            id: friend.id,
            phone: friend.phone,
            name: friend.name,
            profile_image_url: friend.profile_image_url,
            is_online: !!isOnline,
            last_seen: lastSeen || null,
          };
        })
      );

      logger.info(`Contacts synced for user ${userId}: ${friends.length} matches`);
      res.json({ success: true, friends: enrichedFriends });
    } catch (error) {
      next(error);
    }
  },

  async getFriends(req, res, next) {
    try {
      const userId = req.params.userId;

      const result = await query(
        `SELECT u.id, u.name, u.profile_image_url, u.language_code
         FROM contacts c
         JOIN users u ON u.id = c.contact_user_id
         WHERE c.user_id = $1 AND u.is_active = true
         ORDER BY u.name`,
        [userId]
      );

      const friends = await Promise.all(
        result.rows.map(async (friend) => {
          const isOnline = await cacheService.exists(`online:${friend.id}`);
          return {
            ...friend,
            is_online: !!isOnline,
          };
        })
      );

      res.json({ success: true, friends });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = contactController;
