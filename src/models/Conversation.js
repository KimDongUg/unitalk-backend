const { query } = require('../config/database');

const Conversation = {
  async findOrCreate(user1Id, user2Id) {
    // Ensure consistent ordering for the unique constraint
    const [first, second] = [user1Id, user2Id].sort();

    // Try to find existing conversation
    let result = await query(
      `SELECT * FROM conversations
       WHERE (user1_id = $1 AND user2_id = $2)
          OR (user1_id = $2 AND user2_id = $1)`,
      [first, second]
    );

    if (result.rows[0]) {
      return { conversation: result.rows[0], isNew: false };
    }

    // Create new conversation
    result = await query(
      `INSERT INTO conversations (user1_id, user2_id)
       VALUES ($1, $2)
       RETURNING *`,
      [first, second]
    );
    return { conversation: result.rows[0], isNew: true };
  },

  async findOrCreateForGroup(groupId) {
    // Try to find existing group conversation
    let result = await query(
      `SELECT * FROM conversations WHERE group_id = $1`,
      [groupId]
    );

    if (result.rows[0]) {
      return { conversation: result.rows[0], isNew: false };
    }

    // Create new group conversation
    result = await query(
      `INSERT INTO conversations (group_id)
       VALUES ($1)
       RETURNING *`,
      [groupId]
    );
    return { conversation: result.rows[0], isNew: true };
  },

  async findByGroupId(groupId) {
    const result = await query(
      `SELECT * FROM conversations WHERE group_id = $1`,
      [groupId]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await query(
      `SELECT * FROM conversations WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByUserId(userId) {
    const result = await query(
      `SELECT c.*,
              CASE
                WHEN c.group_id IS NOT NULL THEN 'group'
                ELSE 'dm'
              END AS type,
              CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END AS other_user_id,
              g.name AS group_name,
              g.id AS g_id
       FROM conversations c
       LEFT JOIN groups g ON c.group_id = g.id
       LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = $1
       WHERE (c.user1_id = $1 OR c.user2_id = $1)
          OR (c.group_id IS NOT NULL AND gm.user_id IS NOT NULL)
       ORDER BY c.last_message_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async updateLastMessage(id) {
    await query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
      [id]
    );
  },

  async isParticipant(conversationId, userId) {
    // Check direct (1:1) or group membership
    const result = await query(
      `SELECT 1 FROM conversations c
       WHERE c.id = $1
         AND (
           (c.group_id IS NULL AND (c.user1_id = $2 OR c.user2_id = $2))
           OR
           (c.group_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM group_members gm WHERE gm.group_id = c.group_id AND gm.user_id = $2
           ))
         )`,
      [conversationId, userId]
    );
    return result.rows.length > 0;
  },

  async isGroupParticipant(conversationId, userId) {
    const result = await query(
      `SELECT 1 FROM conversations c
       JOIN group_members gm ON c.group_id = gm.group_id
       WHERE c.id = $1 AND gm.user_id = $2`,
      [conversationId, userId]
    );
    return result.rows.length > 0;
  },

  async getOtherUserId(conversationId, userId) {
    const conversation = await this.findById(conversationId);
    if (!conversation) return null;
    return conversation.user1_id === userId
      ? conversation.user2_id
      : conversation.user1_id;
  },
};

module.exports = Conversation;
