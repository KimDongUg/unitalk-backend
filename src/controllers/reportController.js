const Report = require('../models/Report');
const Block = require('../models/Block');
const logger = require('../utils/logger');

const reportController = {
  // POST /report — Report a user
  async createReport(req, res, next) {
    try {
      const reporterId = req.user.id;
      const { reported_id, reason } = req.validatedBody;

      if (reporterId === reported_id) {
        return res.status(400).json({ error: 'Cannot report yourself' });
      }

      const report = await Report.create(reporterId, reported_id, reason);
      logger.info(`User ${reporterId} reported ${reported_id}`);

      res.status(201).json({ success: true, report });
    } catch (error) {
      next(error);
    }
  },

  // POST /block — Block a user
  async blockUser(req, res, next) {
    try {
      const blockerId = req.user.id;
      const { blocked_id } = req.validatedBody;

      if (blockerId === blocked_id) {
        return res.status(400).json({ error: 'Cannot block yourself' });
      }

      const block = await Block.create(blockerId, blocked_id);
      logger.info(`User ${blockerId} blocked ${blocked_id}`);

      res.status(201).json({ success: true, block });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /block/:blocked_id — Unblock a user
  async unblockUser(req, res, next) {
    try {
      const blockerId = req.user.id;
      const { blocked_id } = req.params;

      const removed = await Block.remove(blockerId, blocked_id);
      if (!removed) {
        return res.status(404).json({ error: 'Block not found' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  // GET /blocks — Get my block list
  async getBlocks(req, res, next) {
    try {
      const blocks = await Block.findByBlocker(req.user.id);
      res.json({ success: true, blocks });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = reportController;
