const { query } = require('../config/database');

const Message = {
  async create({ conversation_id, sender_id, original_text, original_language, translated_texts, sender_language, source_device }) {
    const result = await query(
      `INSERT INTO messages (conversation_id, sender_id, original_text, original_language, translated_texts, sender_language, source_device)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [conversation_id, sender_id, original_text, original_language, JSON.stringify(translated_texts), sender_language || null, source_device || 'mobile']
    );
    return result.rows[0];
  },

  async findByConversation(conversationId, { limit = 50, offset = 0 } = {}) {
    const result = await query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    return result.rows;
  },

  async countByConversation(conversationId) {
    const result = await query(
      `SELECT COUNT(*) as total FROM messages WHERE conversation_id = $1`,
      [conversationId]
    );
    return parseInt(result.rows[0].total, 10);
  },

  async findById(id) {
    const result = await query(
      `SELECT * FROM messages WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByIds(ids) {
    if (!ids.length) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `SELECT * FROM messages WHERE id IN (${placeholders})`,
      ids
    );
    return result.rows;
  },

  async markAsRead(messageIds, readAt = new Date()) {
    if (!messageIds.length) return;
    const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(', ');
    await query(
      `UPDATE messages SET read_at = $${messageIds.length + 1}
       WHERE id IN (${placeholders}) AND read_at IS NULL`,
      [...messageIds, readAt]
    );
  },

  async getUnreadCount(conversationId, userId) {
    const result = await query(
      `SELECT COUNT(*) as count FROM messages
       WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [conversationId, userId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Message;
