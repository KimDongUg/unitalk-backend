const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { validate, sendOtpSchema, verifyOtpSchema, registerSchema, loginWithDeviceSchema, qrVerifySchema } = require('../utils/validation');
const { otpLimiter } = require('../middleware/rateLimiter');

// POST /auth/register (nickname + password)
router.post('/register', validate(registerSchema), authController.register);

// POST /auth/login (nickname + password + optional deviceType)
router.post('/login', validate(loginWithDeviceSchema), authController.login);

// QR Login flow
router.post('/qr/generate', authController.generateQr);
router.post('/qr/verify', authMiddleware, validate(qrVerifySchema), authController.verifyQr);
router.get('/qr/check/:qrToken', authController.checkQr);

// Device management
router.get('/devices', authMiddleware, authController.getDevices);
router.delete('/devices/:deviceId', authMiddleware, authController.removeDevice);

// POST /auth/otp/send (legacy OTP)
router.post('/otp/send', otpLimiter, validate(sendOtpSchema), authController.sendOtp);

// POST /auth/otp/verify (legacy OTP)
router.post('/otp/verify', validate(verifyOtpSchema), authController.verifyOtp);

// GET /auth/me (requires auth)
router.get('/me', authMiddleware, authController.getMe);

// POST /auth/logout (requires auth)
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
