const User = require('../models/User');
const logger = require('../utils/logger');

const userController = {
  async getMe(req, res, next) {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          profile_image_url: user.profile_image_url,
          language_code: user.language_code,
          target_language: user.target_language,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const { nickname, nativeLang, targetLang } = req.validatedBody;
      const updates = {};

      if (nickname !== undefined) updates.name = nickname;
      if (nativeLang !== undefined) updates.language_code = nativeLang;
      if (targetLang !== undefined) updates.target_language = targetLang;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const user = await User.update(req.params.userId, updates);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`User profile updated: ${req.params.userId}`);
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  },

  async updateMe(req, res, next) {
    try {
      const allowedFields = ['name', 'language_code'];
      const updates = {};

      for (const field of allowedFields) {
        if (req.validatedBody[field] !== undefined) {
          updates[field] = req.validatedBody[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const user = await User.update(req.user.id, updates);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`User updated: ${req.user.id}`);
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  },

  async updateFcmToken(req, res, next) {
    try {
      const { fcm_token } = req.validatedBody;

      await User.updateFcmToken(req.user.id, fcm_token);

      logger.info(`FCM token updated for user: ${req.user.id}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = userController;
