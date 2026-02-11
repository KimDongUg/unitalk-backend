const express = require('express');
const router = express.Router();
const chatRoomController = require('../controllers/chatRoomController');
const authMiddleware = require('../middleware/auth');
const { validate, validateQuery, createChatRoomSchema, sendChatMessageSchema, pageBasedPaginationSchema } = require('../utils/validation');

// All routes require authentication
router.use(authMiddleware);

// POST /chatrooms
router.post('/', validate(createChatRoomSchema), chatRoomController.createChatRoom);

// GET /chatrooms/:id/messages?page&limit
router.get('/:id/messages', validateQuery(pageBasedPaginationSchema), chatRoomController.getMessages);

// POST /chatrooms/:id/messages
router.post('/:id/messages', validate(sendChatMessageSchema), chatRoomController.sendMessage);

module.exports = router;
