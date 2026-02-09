const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');
const { validate, updateUserSchema, fcmTokenSchema } = require('../utils/validation');

// All routes require authentication
router.use(authMiddleware);

// GET /api/users/me
router.get('/me', userController.getMe);

// PUT /api/users/me
router.put('/me', validate(updateUserSchema), userController.updateMe);

// POST /api/users/me/fcm-token
router.post('/me/fcm-token', validate(fcmTokenSchema), userController.updateFcmToken);

module.exports = router;
