const { query } = require('../config/database');

const UserDevice = {
  async findByUserId(userId) {
    const result = await query(
      `SELECT id, user_id, device_type, device_name, device_token, is_online, last_active_at, created_at
       FROM user_devices WHERE user_id = $1 ORDER BY last_active_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async findByUserAndType(userId, deviceType) {
    const result = await query(
      `SELECT * FROM user_devices WHERE user_id = $1 AND device_type = $2`,
      [userId, deviceType]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await query(
      `SELECT * FROM user_devices WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async upsert({ user_id, device_type, device_name, device_token }) {
    const result = await query(
      `INSERT INTO user_devices (user_id, device_type, device_name, device_token, is_online, last_active_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       ON CONFLICT (user_id, device_type) DO UPDATE SET
         device_name = COALESCE($3, user_devices.device_name),
         device_token = COALESCE($4, user_devices.device_token),
         is_online = true,
         last_active_at = NOW()
       RETURNING *`,
      [user_id, device_type, device_name || null, device_token || null]
    );
    return result.rows[0];
  },

  async setOnline(userId, deviceType, socketId) {
    await query(
      `UPDATE user_devices SET is_online = true, socket_id = $3, last_active_at = NOW()
       WHERE user_id = $1 AND device_type = $2`,
      [userId, deviceType, socketId]
    );
  },

  async setOffline(userId, deviceType) {
    await query(
      `UPDATE user_devices SET is_online = false, socket_id = NULL, last_active_at = NOW()
       WHERE user_id = $1 AND device_type = $2`,
      [userId, deviceType]
    );
  },

  async setOfflineBySocketId(socketId) {
    const result = await query(
      `UPDATE user_devices SET is_online = false, socket_id = NULL, last_active_at = NOW()
       WHERE socket_id = $1 RETURNING user_id, device_type`,
      [socketId]
    );
    return result.rows[0] || null;
  },

  async getOnlineDevices(userId) {
    const result = await query(
      `SELECT device_type, device_token, socket_id FROM user_devices
       WHERE user_id = $1 AND is_online = true`,
      [userId]
    );
    return result.rows;
  },

  async isAnyDeviceOnline(userId) {
    const result = await query(
      `SELECT 1 FROM user_devices WHERE user_id = $1 AND is_online = true LIMIT 1`,
      [userId]
    );
    return result.rows.length > 0;
  },

  async isMobileOnline(userId) {
    const result = await query(
      `SELECT 1 FROM user_devices WHERE user_id = $1 AND device_type = 'mobile' AND is_online = true`,
      [userId]
    );
    return result.rows.length > 0;
  },

  async remove(id, userId) {
    const result = await query(
      `DELETE FROM user_devices WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },
};

module.exports = UserDevice;
