const Like = require('../models/Like');
const Match = require('../models/Match');
const Block = require('../models/Block');
const logger = require('../utils/logger');

const likeController = {
  // POST /like — Send a like; auto-create match if mutual
  async sendLike(req, res, next) {
    try {
      const likerId = req.user.id;
      const { liked_id } = req.validatedBody;

      if (likerId === liked_id) {
        return res.status(400).json({ error: 'Cannot like yourself' });
      }

      // Check block
      const blocked = await Block.isBlocked(likerId, liked_id);
      if (blocked) {
        return res.status(403).json({ error: 'Cannot like a blocked user' });
      }

      const like = await Like.create(likerId, liked_id);
      if (!like) {
        return res.json({ success: true, message: 'Already liked', matched: false });
      }

      // Check if mutual
      const isMutual = await Like.checkMutual(likerId, liked_id);
      let match = null;
      if (isMutual) {
        match = await Match.create(likerId, liked_id);
        logger.info(`Match created between ${likerId} and ${liked_id}`);
      }

      res.status(201).json({
        success: true,
        like,
        matched: isMutual,
        match: match || undefined,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /matches — Get my matches
  async getMatches(req, res, next) {
    try {
      const matches = await Match.findByUser(req.user.id);
      res.json({ success: true, matches });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = likeController;
