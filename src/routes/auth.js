const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate, sendOtpSchema, verifyOtpSchema } = require('../utils/validation');
const { otpLimiter } = require('../middleware/rateLimiter');

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, validate(sendOtpSchema), authController.sendOtp);

// POST /api/auth/verify-otp
router.post('/verify-otp', validate(verifyOtpSchema), authController.verifyOtp);

module.exports = router;
