const { query } = require('../config/database');
const Block = require('../models/Block');
const logger = require('../utils/logger');

const profileController = {
  // GET /profiles — List profiles with filters (country, age, gender)
  async listProfiles(req, res, next) {
    try {
      const userId = req.user.id;
      const { country, gender, min_age, max_age, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      // Get blocked user IDs to exclude
      const blockedIds = await Block.getBlockedIds(userId);

      let sql = `
        SELECT id, name AS nickname, gender, country, language_code AS language,
               bio, profile_image_url AS profile_image, birth_date,
               EXTRACT(YEAR FROM AGE(birth_date))::INT AS age
        FROM users
        WHERE is_active = true AND id != $1
      `;
      const params = [userId];
      let paramIdx = 2;

      // Exclude blocked users
      if (blockedIds.length > 0) {
        sql += ` AND id != ALL($${paramIdx}::uuid[])`;
        params.push(blockedIds);
        paramIdx++;
      }

      if (country) {
        sql += ` AND country = $${paramIdx}`;
        params.push(country);
        paramIdx++;
      }

      if (gender) {
        sql += ` AND gender = $${paramIdx}`;
        params.push(gender);
        paramIdx++;
      }

      if (min_age) {
        sql += ` AND birth_date <= (CURRENT_DATE - INTERVAL '1 year' * $${paramIdx})`;
        params.push(parseInt(min_age, 10));
        paramIdx++;
      }

      if (max_age) {
        sql += ` AND birth_date >= (CURRENT_DATE - INTERVAL '1 year' * $${paramIdx})`;
        params.push(parseInt(max_age, 10));
        paramIdx++;
      }

      sql += ` ORDER BY created_at DESC`;
      params.push(parseInt(limit, 10));
      sql += ` LIMIT $${paramIdx}`;
      paramIdx++;
      params.push(offset);
      sql += ` OFFSET $${paramIdx}`;

      const result = await query(sql, params);
      res.json({ success: true, profiles: result.rows });
    } catch (error) {
      next(error);
    }
  },

  // GET /profile/:id — Get a specific profile
  async getProfile(req, res, next) {
    try {
      const { id } = req.params;
      const result = await query(
        `SELECT id, name AS nickname, gender, country, language_code AS language,
                bio, profile_image_url AS profile_image, birth_date,
                EXTRACT(YEAR FROM AGE(birth_date))::INT AS age
         FROM users WHERE id = $1 AND is_active = true`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      res.json({ success: true, profile: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  // POST /profile — Create profile (set profile fields on existing user)
  async createProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { nickname, gender, country, language, bio, profile_image, birth_date } = req.validatedBody;

      const result = await query(
        `UPDATE users SET
          name = COALESCE($1, name),
          gender = COALESCE($2, gender),
          country = COALESCE($3, country),
          language_code = COALESCE($4, language_code),
          bio = COALESCE($5, bio),
          profile_image_url = COALESCE($6, profile_image_url),
          birth_date = COALESCE($7, birth_date),
          updated_at = NOW()
         WHERE id = $8
         RETURNING id, name AS nickname, gender, country, language_code AS language,
                   bio, profile_image_url AS profile_image, birth_date`,
        [nickname, gender, country, language, bio, profile_image, birth_date, userId]
      );

      res.status(201).json({ success: true, profile: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  // PUT /profile — Update profile
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { nickname, gender, country, language, bio, profile_image, birth_date } = req.validatedBody;

      const result = await query(
        `UPDATE users SET
          name = COALESCE($1, name),
          gender = COALESCE($2, gender),
          country = COALESCE($3, country),
          language_code = COALESCE($4, language_code),
          bio = COALESCE($5, bio),
          profile_image_url = COALESCE($6, profile_image_url),
          birth_date = COALESCE($7, birth_date),
          updated_at = NOW()
         WHERE id = $8
         RETURNING id, name AS nickname, gender, country, language_code AS language,
                   bio, profile_image_url AS profile_image, birth_date`,
        [nickname, gender, country, language, bio, profile_image, birth_date, userId]
      );

      res.json({ success: true, profile: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = profileController;
