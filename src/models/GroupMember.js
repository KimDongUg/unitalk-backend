const { query } = require('../config/database');

const GroupMember = {
  async join(groupId, userId, role = 'member') {
    const result = await query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO NOTHING
       RETURNING *`,
      [groupId, userId, role]
    );
    return result.rows[0] || null;
  },

  async leave(groupId, userId) {
    const result = await query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING *`,
      [groupId, userId]
    );
    return result.rows[0] || null;
  },

  async isMember(groupId, userId) {
    const result = await query(
      `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    return result.rows.length > 0;
  },

  async getMembers(groupId) {
    const result = await query(
      `SELECT u.id, u.name, u.profile_image_url, u.language_code, u.target_language, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );
    return result.rows;
  },

  async getMemberLanguages(groupId) {
    const result = await query(
      `SELECT DISTINCT u.language_code
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1 AND u.language_code IS NOT NULL`,
      [groupId]
    );
    return result.rows.map((r) => r.language_code);
  },

  async joinDefaultGroups(userId, universityId) {
    const result = await query(
      `INSERT INTO group_members (group_id, user_id, role)
       SELECT g.id, $1, 'member'
       FROM groups g
       WHERE g.university_id = $2 AND g.type = 'default'
       ON CONFLICT (group_id, user_id) DO NOTHING
       RETURNING *`,
      [userId, universityId]
    );
    return result.rows;
  },
};

module.exports = GroupMember;
