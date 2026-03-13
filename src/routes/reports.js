const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');
const { validate, reportSchema } = require('../utils/validation');

router.use(authMiddleware);

// POST /report — Report a user
router.post('/', validate(reportSchema), reportController.createReport);

module.exports = router;
