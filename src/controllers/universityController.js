const University = require('../models/University');
const Group = require('../models/Group');
const logger = require('../utils/logger');

const universityController = {
  async list(req, res, next) {
    try {
      const { search, country } = req.validatedQuery;
      const universities = await University.findAll({ search, country });

      res.json({
        success: true,
        universities,
      });
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const university = await University.findById(id);

      if (!university) {
        return res.status(404).json({ error: 'University not found' });
      }

      const groups = await Group.findByUniversityId(id);

      res.json({
        success: true,
        university,
        groups,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = universityController;
