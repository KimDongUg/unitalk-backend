const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/auth');
const { validate, profileCreateSchema, profileUpdateSchema } = require('../utils/validation');

router.use(authMiddleware);

// GET /profiles — List profiles with filters
router.get('/', profileController.listProfiles);

// GET /profile/:id — Get a specific profile
router.get('/:id', profileController.getProfile);

// POST /profile — Create profile
router.post('/', validate(profileCreateSchema), profileController.createProfile);

// PUT /profile — Update profile
router.put('/', validate(profileUpdateSchema), profileController.updateProfile);

module.exports = router;
