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
              CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END AS other_user_id
       FROM conversations c
       WHERE c.user1_id = $1 OR c.user2_id = $1
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
    const result = await query(
      `SELECT 1 FROM conversations
       WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)`,
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
