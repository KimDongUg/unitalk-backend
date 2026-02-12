const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { validate, sendOtpSchema, verifyOtpSchema, registerSchema, loginSchema } = require('../utils/validation');
const { otpLimiter } = require('../middleware/rateLimiter');

// POST /auth/register (nickname + password)
router.post('/register', validate(registerSchema), authController.register);

// POST /auth/login (nickname + password)
router.post('/login', validate(loginSchema), authController.login);

// POST /auth/otp/send (legacy OTP)
router.post('/otp/send', otpLimiter, validate(sendOtpSchema), authController.sendOtp);

// POST /auth/otp/verify (legacy OTP)
router.post('/otp/verify', validate(verifyOtpSchema), authController.verifyOtp);

// GET /auth/me (requires auth)
router.get('/me', authMiddleware, authController.getMe);

// POST /auth/logout (requires auth)
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
