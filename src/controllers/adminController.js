const { query } = require('../config/database');
const Report = require('../models/Report');
const logger = require('../utils/logger');

const adminController = {
  // Middleware to check admin role (queries DB for security)
  async requireAdmin(req, res, next) {
    try {
      const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      req.user.role = 'admin';
      next();
    } catch (error) {
      next(error);
    }
  },

  // GET /admin/users — List all users
  async getUsers(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const offset = (page - 1) * limit;

      const result = await query(
        `SELECT id, name, email, gender, country, language_code, profile_image_url,
                is_active, role, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await query('SELECT COUNT(*) as total FROM users');

      res.json({
        success: true,
        users: result.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page,
        limit,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /admin/reports — List all reports
  async getReports(req, res, next) {
    try {
      const { status } = req.query;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

      const reports = await Report.findAll({ status, page, limit });
      res.json({ success: true, reports });
    } catch (error) {
      next(error);
    }
  },

  // POST /admin/ban — Ban/deactivate a user
  async banUser(req, res, next) {
    try {
      const { user_id, action } = req.validatedBody;

      const isActive = action === 'unban';
      const result = await query(
        `UPDATE users SET is_active = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, is_active`,
        [isActive, user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Mark related reports as resolved
      if (action === 'ban') {
        await query(
          `UPDATE reports SET status = 'resolved' WHERE reported_id = $1 AND status = 'pending'`,
          [user_id]
        );
      }

      logger.info(`Admin ${req.user.id} ${action}ned user ${user_id}`);
      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = adminController;
