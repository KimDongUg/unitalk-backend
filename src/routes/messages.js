const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/auth');
const { validate, readMessagesSchema } = require('../utils/validation');

// All routes require authentication
router.use(authMiddleware);

// GET /api/messages/conversations
router.get('/conversations', messageController.getConversations);

// GET /api/messages/:conversationId
router.get('/:conversationId', messageController.getMessages);

// POST /api/messages/read
router.post('/read', validate(readMessagesSchema), messageController.markAsRead);

module.exports = router;
