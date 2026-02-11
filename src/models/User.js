const { query } = require('../config/database');
const crypto = require('crypto');

const User = {
  hashPhone(phone) {
    return crypto.createHash('sha256').update(phone).digest('hex');
  },

  async create({ phone, name, language_code }) {
    const phoneHash = this.hashPhone(phone);
    const result = await query(
      `INSERT INTO users (phone, phone_hash, name, language_code)
       VALUES ($1, $2, $3, $4)
       RETURNING id, phone, name, profile_image_url, language_code, target_language, created_at`,
      [phone, phoneHash, name, language_code || 'en']
    );
    return result.rows[0];
  },

  async findById(id) {
    const result = await query(
      `SELECT id, phone, name, profile_image_url, language_code, target_language, fcm_token, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByPhone(phone) {
    const result = await query(
      `SELECT id, phone, name, profile_image_url, language_code, target_language, fcm_token, is_active, created_at, updated_at
       FROM users WHERE phone = $1`,
      [phone]
    );
    return result.rows[0] || null;
  },

  async findByPhoneHash(phoneHash) {
    const result = await query(
      `SELECT id, phone, name, profile_image_url, language_code, target_language, is_active
       FROM users WHERE phone_hash = $1 AND is_active = true`,
      [phoneHash]
    );
    return result.rows[0] || null;
  },

  async findByPhoneHashes(phoneHashes) {
    if (!phoneHashes.length) return [];
    const placeholders = phoneHashes.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `SELECT id, phone, name, profile_image_url, language_code, target_language
       FROM users WHERE phone_hash IN (${placeholders}) AND is_active = true`,
      phoneHashes
    );
    return result.rows;
  },

  async update(id, fields) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, phone, name, profile_image_url, language_code, target_language, updated_at`,
      values
    );
    return result.rows[0] || null;
  },

  async updateFcmToken(id, fcmToken) {
    await query(
      `UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2`,
      [fcmToken, id]
    );
  },

  async findOrCreate(phone) {
    let user = await this.findByPhone(phone);
    if (user) {
      return { user, isNew: false };
    }
    user = await this.create({ phone });
    return { user, isNew: true };
  },
};

module.exports = User;
