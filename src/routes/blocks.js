const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');
const { validate, blockSchema } = require('../utils/validation');

router.use(authMiddleware);

// POST /block — Block a user
router.post('/', validate(blockSchema), reportController.blockUser);

// DELETE /block/:blocked_id — Unblock a user
router.delete('/:blocked_id', reportController.unblockUser);

// GET /block — Get my block list
router.get('/', reportController.getBlocks);

module.exports = router;
