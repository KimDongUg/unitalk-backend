const { query } = require('../config/database');

const Like = {
  async create(likerId, likedId) {
    const result = await query(
      `INSERT INTO likes (liker_id, liked_id)
       VALUES ($1, $2)
       ON CONFLICT (liker_id, liked_id) DO NOTHING
       RETURNING id, liker_id, liked_id, created_at`,
      [likerId, likedId]
    );
    return result.rows[0] || null;
  },

  async checkMutual(likerId, likedId) {
    const result = await query(
      `SELECT id FROM likes WHERE liker_id = $1 AND liked_id = $2`,
      [likedId, likerId]
    );
    return result.rows.length > 0;
  },

  async findByLiker(likerId) {
    const result = await query(
      `SELECT l.*, u.name, u.profile_image_url, u.country, u.gender
       FROM likes l
       JOIN users u ON u.id = l.liked_id
       WHERE l.liker_id = $1
       ORDER BY l.created_at DESC`,
      [likerId]
    );
    return result.rows;
  },
};

module.exports = Like;
