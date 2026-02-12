const express = require('express');
const router = express.Router();
const universityController = require('../controllers/universityController');
const { validateQuery, universitySearchSchema } = require('../utils/validation');

// GET /api/universities?search=&country=  (no auth required)
router.get('/', validateQuery(universitySearchSchema), universityController.list);

// GET /api/universities/:id  (no auth required)
router.get('/:id', universityController.getById);

module.exports = router;
