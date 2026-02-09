const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const authMiddleware = require('../middleware/auth');
const { validate, syncContactsSchema } = require('../utils/validation');

// All routes require authentication
router.use(authMiddleware);

// POST /api/contacts/sync
router.post('/sync', validate(syncContactsSchema), contactController.syncContacts);

// GET /api/contacts/friends
router.get('/friends', contactController.getFriends);

module.exports = router;
