const { query } = require('../config/database');

const Block = {
  async create(blockerId, blockedId) {
    const result = await query(
      `INSERT INTO blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING
       RETURNING id, blocker_id, blocked_id, created_at`,
      [blockerId, blockedId]
    );
    return result.rows[0] || null;
  },

  async remove(blockerId, blockedId) {
    const result = await query(
      `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING id`,
      [blockerId, blockedId]
    );
    return result.rows[0] || null;
  },

  async findByBlocker(blockerId) {
    const result = await query(
      `SELECT b.*, u.name AS blocked_name, u.profile_image_url AS blocked_image
       FROM blocks b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC`,
      [blockerId]
    );
    return result.rows;
  },

  async isBlocked(userId1, userId2) {
    const result = await query(
      `SELECT id FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId1, userId2]
    );
    return result.rows.length > 0;
  },

  async getBlockedIds(userId) {
    const result = await query(
      `SELECT blocked_id FROM blocks WHERE blocker_id = $1`,
      [userId]
    );
    return result.rows.map(r => r.blocked_id);
  },
};

module.exports = Block;
