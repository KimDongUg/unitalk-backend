const { query } = require('../config/database');

const Match = {
  async create(user1Id, user2Id) {
    const [uid1, uid2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    const result = await query(
      `INSERT INTO matches (user1_id, user2_id)
       VALUES ($1, $2)
       ON CONFLICT (user1_id, user2_id) DO NOTHING
       RETURNING id, user1_id, user2_id, matched_at`,
      [uid1, uid2]
    );
    return result.rows[0] || null;
  },

  async findByUser(userId) {
    const result = await query(
      `SELECT m.*,
        CASE WHEN m.user1_id = $1 THEN u2.id ELSE u1.id END AS partner_id,
        CASE WHEN m.user1_id = $1 THEN u2.name ELSE u1.name END AS partner_name,
        CASE WHEN m.user1_id = $1 THEN u2.profile_image_url ELSE u1.profile_image_url END AS partner_image,
        CASE WHEN m.user1_id = $1 THEN u2.country ELSE u1.country END AS partner_country,
        CASE WHEN m.user1_id = $1 THEN u2.gender ELSE u1.gender END AS partner_gender,
        CASE WHEN m.user1_id = $1 THEN u2.bio ELSE u1.bio END AS partner_bio
       FROM matches m
       JOIN users u1 ON u1.id = m.user1_id
       JOIN users u2 ON u2.id = m.user2_id
       WHERE m.user1_id = $1 OR m.user2_id = $1
       ORDER BY m.matched_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async exists(user1Id, user2Id) {
    const [uid1, uid2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    const result = await query(
      `SELECT id FROM matches WHERE user1_id = $1 AND user2_id = $2`,
      [uid1, uid2]
    );
    return result.rows.length > 0;
  },
};

module.exports = Match;
