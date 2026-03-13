const express = require('express');
const router = express.Router();
const likeController = require('../controllers/likeController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /matches — Get my matches
router.get('/', likeController.getMatches);

module.exports = router;
