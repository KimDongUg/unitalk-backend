const { query } = require('../config/database');

const Group = {
  async findById(id) {
    const result = await query(
      `SELECT g.*, u.name AS university_name, u.name_en AS university_name_en
       FROM groups g
       LEFT JOIN universities u ON g.university_id = u.id
       WHERE g.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByUniversityId(universityId, { category } = {}) {
    const params = [universityId];
    let categoryFilter = '';
    if (category) {
      categoryFilter = ' AND g.category = $2';
      params.push(category);
    }

    const result = await query(
      `SELECT g.*, u.name AS university_name
       FROM groups g
       LEFT JOIN universities u ON g.university_id = u.id
       WHERE g.university_id = $1 AND g.is_public = true${categoryFilter}
       ORDER BY g.type DESC, g.created_at ASC`,
      params
    );
    return result.rows;
  },

  async findByUserId(userId) {
    const result = await query(
      `SELECT g.*, gm.role, gm.joined_at,
              u.name AS university_name,
              (SELECT m.original_text FROM messages m
               JOIN conversations c ON m.conversation_id = c.id
               WHERE c.group_id = g.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT m.created_at FROM messages m
               JOIN conversations c ON m.conversation_id = c.id
               WHERE c.group_id = g.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN universities u ON g.university_id = u.id
       WHERE gm.user_id = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [userId]
    );
    return result.rows;
  },

  async create({ university_id, name, description, category, is_public, created_by }) {
    const result = await query(
      `INSERT INTO groups (university_id, name, description, category, type, is_public, created_by)
       VALUES ($1, $2, $3, $4, 'custom', $5, $6)
       RETURNING *`,
      [university_id, name, description || null, category || 'general', is_public !== false, created_by]
    );
    return result.rows[0];
  },

  async incrementMemberCount(groupId) {
    await query(
      `UPDATE groups SET member_count = member_count + 1, updated_at = NOW() WHERE id = $1`,
      [groupId]
    );
  },

  async decrementMemberCount(groupId) {
    await query(
      `UPDATE groups SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = $1`,
      [groupId]
    );
  },

  async getRecentMessages(groupId, limit = 3) {
    const result = await query(
      `SELECT m.id, m.sender_id, m.original_text, m.translated_texts, m.is_announcement, m.created_at,
              usr.name AS sender_name
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       JOIN users usr ON m.sender_id = usr.id
       WHERE c.group_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [groupId, limit]
    );
    return result.rows;
  },
};

module.exports = Group;
