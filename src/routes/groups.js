const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const authMiddleware = require('../middleware/auth');
const { validate, validateQuery, groupListSchema, createGroupSchema, announcementSchema } = require('../utils/validation');

// GET /api/groups?universityId=&category=  (public listing)
router.get('/', validateQuery(groupListSchema), groupController.list);

// Auth required for all below
router.use(authMiddleware);

// GET /api/groups/my  (my groups with latest messages)
router.get('/my', groupController.myGroups);

// GET /api/groups/:id  (group detail)
router.get('/:id', groupController.getById);

// POST /api/groups  (create custom group)
router.post('/', validate(createGroupSchema), groupController.create);

// POST /api/groups/:id/join
router.post('/:id/join', groupController.join);

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', groupController.leave);

// GET /api/groups/:id/members
router.get('/:id/members', groupController.getMembers);

// POST /api/groups/:id/announcement
router.post('/:id/announcement', validate(announcementSchema), groupController.sendAnnouncement);

module.exports = router;
