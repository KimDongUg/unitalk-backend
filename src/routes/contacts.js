const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const authMiddleware = require('../middleware/auth');
const { validate, syncContactsSchemaV2 } = require('../utils/validation');

// All routes require authentication
router.use(authMiddleware);

// POST /contacts/sync
router.post('/sync', validate(syncContactsSchemaV2), contactController.syncContacts);

module.exports = router;
