const express = require('express');
const router = express.Router();
const likeController = require('../controllers/likeController');
const authMiddleware = require('../middleware/auth');
const { validate, likeSchema } = require('../utils/validation');

router.use(authMiddleware);

// POST /like — Send a like
router.post('/', validate(likeSchema), likeController.sendLike);

// GET /matches — Get my matches
router.get('/matches', likeController.getMatches);

module.exports = router;
