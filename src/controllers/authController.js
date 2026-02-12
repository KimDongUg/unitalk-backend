const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const GroupMember = require('../models/GroupMember');
const smsService = require('../services/smsService');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const OTP_TTL = 300; // 5 minutes
const TEST_OTP = '123456';
const QR_TTL = 180; // 3 minutes

const authController = {
  async register(req, res, next) {
    try {
      const { nickname, password, universityId, viewLang, inputLang } = req.validatedBody;

      // Check nickname uniqueness
      const existing = await User.findByName(nickname);
      if (existing) {
        return res.status(409).json({ error: 'Nickname already taken' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await User.createWithPassword({
        name: nickname,
        password: hashedPassword,
        university_id: universityId,
        language_code: viewLang,
        target_language: inputLang,
      });

      // Auto-join default groups
      await GroupMember.joinDefaultGroups(user.id, universityId);

      // Generate JWT
      const token = jwt.sign(
        { id: user.id, nickname: user.name, universityId: user.university_id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      logger.info(`User registered: ${user.id}`);
      res.status(201).json({
        success: true,
        token,
        user: {
          id: user.id,
          nickname: user.name,
          universityId: user.university_id,
          viewLang: user.language_code,
          inputLang: user.target_language,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const { nickname, password, deviceType, deviceName } = req.validatedBody;

      const user = await User.findByNameWithPassword(nickname);
      if (!user) {
        return res.status(401).json({ error: 'Invalid nickname or password' });
      }

      if (!user.password) {
        return res.status(401).json({ error: 'Invalid nickname or password' });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid nickname or password' });
      }

      const device = deviceType || 'mobile';
      const token = jwt.sign(
        { id: user.id, nickname: user.name, universityId: user.university_id, deviceType: device },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Register device
      await UserDevice.upsert({
        user_id: user.id,
        device_type: device,
        device_name: deviceName || null,
        device_token: null,
      });

      logger.info(`User logged in: ${user.id} (${device})`);
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          nickname: user.name,
          universityId: user.university_id,
          viewLang: user.language_code,
          inputLang: user.target_language,
        },
      });
    } catch (error) {
      next(error);
    }
  },

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

        // Set device offline
        if (decoded && decoded.deviceType) {
          await UserDevice.setOffline(req.user.id, decoded.deviceType);
        }
      }

      logger.info(`User logged out: ${req.user.id}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  // QR Login: PC generates a QR token
  async generateQr(req, res, next) {
    try {
      const qrToken = uuidv4();
      // Store in Redis: qr:{token} → 'pending', TTL 180s
      await cacheService.setRaw(`qr:${qrToken}`, 'pending', QR_TTL);

      logger.info(`QR token generated: ${qrToken}`);
      res.json({ success: true, qrToken, expiresIn: QR_TTL });
    } catch (error) {
      next(error);
    }
  },

  // QR Login: Mobile scans and approves
  async verifyQr(req, res, next) {
    try {
      const { qrToken } = req.validatedBody;
      const userId = req.user.id;

      // Check QR token exists and is pending
      const status = await cacheService.getRaw(`qr:${qrToken}`);
      if (!status) {
        return res.status(400).json({ error: 'QR code expired or invalid' });
      }
      if (status !== 'pending') {
        return res.status(400).json({ error: 'QR code already used' });
      }

      // Get user info for PC token
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Generate PC token
      const pcToken = jwt.sign(
        { id: user.id, nickname: user.name, universityId: user.university_id, deviceType: 'pc' },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Register PC device
      await UserDevice.upsert({
        user_id: user.id,
        device_type: 'pc',
        device_name: 'PC Client',
        device_token: null,
      });

      // Store approved data in Redis for PC to poll
      await cacheService.set(`qr:${qrToken}`, {
        status: 'approved',
        token: pcToken,
        user: {
          id: user.id,
          nickname: user.name,
          universityId: user.university_id,
          viewLang: user.language_code,
          inputLang: user.target_language,
        },
      }, QR_TTL);

      // Also emit via Socket.io if PC is listening
      const io = req.app.get('io');
      if (io) {
        io.to(`qr:${qrToken}`).emit('qr:approved', {
          token: pcToken,
          user: {
            id: user.id,
            nickname: user.name,
            universityId: user.university_id,
            viewLang: user.language_code,
            inputLang: user.target_language,
          },
        });
      }

      logger.info(`QR login approved by user ${userId}`);
      res.json({ success: true, message: 'QR login approved' });
    } catch (error) {
      next(error);
    }
  },

  // QR Login: PC polls for approval status
  async checkQr(req, res, next) {
    try {
      const { qrToken } = req.params;

      const data = await cacheService.get(`qr:${qrToken}`);
      if (!data) {
        // Try raw (still pending)
        const raw = await cacheService.getRaw(`qr:${qrToken}`);
        if (!raw) {
          return res.status(400).json({ error: 'QR code expired or invalid' });
        }
        return res.json({ success: true, status: 'pending' });
      }

      if (data.status === 'approved') {
        // Clean up after delivery
        await cacheService.del(`qr:${qrToken}`);
        return res.json({
          success: true,
          status: 'approved',
          token: data.token,
          user: data.user,
        });
      }

      res.json({ success: true, status: 'pending' });
    } catch (error) {
      next(error);
    }
  },

  // Device management: list devices
  async getDevices(req, res, next) {
    try {
      const devices = await UserDevice.findByUserId(req.user.id);
      res.json({ success: true, devices });
    } catch (error) {
      next(error);
    }
  },

  // Device management: remove a device
  async removeDevice(req, res, next) {
    try {
      const { deviceId } = req.params;
      const removed = await UserDevice.remove(deviceId, req.user.id);

      if (!removed) {
        return res.status(404).json({ error: 'Device not found' });
      }

      logger.info(`Device removed: ${deviceId} by user ${req.user.id}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;
