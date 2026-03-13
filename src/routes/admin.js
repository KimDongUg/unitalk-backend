const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const { validate, banSchema } = require('../utils/validation');

router.use(authMiddleware);
router.use(adminController.requireAdmin);

// GET /admin/users — List all users
router.get('/users', adminController.getUsers);

// GET /admin/reports — List all reports
router.get('/reports', adminController.getReports);

// POST /admin/ban — Ban/unban a user
router.post('/ban', validate(banSchema), adminController.banUser);

module.exports = router;
