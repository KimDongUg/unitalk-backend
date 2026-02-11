const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const contactController = require('../controllers/contactController');
const chatRoomController = require('../controllers/chatRoomController');
const authMiddleware = require('../middleware/auth');
const { validate, updateProfileSchema, updateUserSchema, fcmTokenSchema } = require('../utils/validation');

// All routes require authentication
router.use(authMiddleware);

// PUT /users/:userId/profile
router.put('/:userId/profile', validate(updateProfileSchema), userController.updateProfile);

// GET /users/:userId/friends
router.get('/:userId/friends', contactController.getFriends);

// GET /users/:userId/chatrooms
router.get('/:userId/chatrooms', chatRoomController.getChatRooms);

// Legacy endpoints (backward compatibility)
// GET /users/me
router.get('/me', userController.getMe);

// PUT /users/me
router.put('/me', validate(updateUserSchema), userController.updateMe);

// POST /users/me/fcm-token
router.post('/me/fcm-token', validate(fcmTokenSchema), userController.updateFcmToken);

module.exports = router;
