const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const smsService = require('../services/smsService');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const OTP_TTL = 300; // 5 minutes
const TEST_OTP = '123456';

const authController = {
  async sendOtp(req, res, next) {
    try {
      const { phone } = req.validatedBody;

      // Generate OTP
      const otp =
        config.nodeEnv === 'test' ? TEST_OTP : smsService.generateOtp();

      // Store in Redis with 5-min TTL
      await cacheService.setRaw(`otp:${phone}`, otp, OTP_TTL);

      // Send SMS
      await smsService.sendOtp(phone, otp);

      logger.info(`OTP sent to ${phone}`);
      res.json({ success: true, message: `OTP sent to ${phone}` });
    } catch (error) {
      next(error);
    }
  },

  async verifyOtp(req, res, next) {
    try {
      const { phone, code } = req.validatedBody;

      // Get stored OTP from Redis
      const storedOtp = await cacheService.getRaw(`otp:${phone}`);

      if (!storedOtp) {
        return res.status(400).json({ error: 'OTP expired or not found' });
      }

      if (storedOtp !== code) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }

      // Delete used OTP
      await cacheService.del(`otp:${phone}`);

      // Find or create user
      const { user, isNew } = await User.findOrCreate(phone);

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, phone: user.phone },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      logger.info(`User authenticated: ${user.id}`);
      res.json({
        success: true,
        token,
        isNew,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          language_code: user.language_code,
          target_language: user.target_language,
        },
      });
    } catch (error) {
      next(error);
    }
  },

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

  async logout(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        // Decode to get expiration
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
          const ttl = decoded.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            // Store token in Redis blacklist until it expires
            await cacheService.setRaw(`blacklist:${token}`, '1', ttl);
          }
        }
      }

      logger.info(`User logged out: ${req.user.id}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;
