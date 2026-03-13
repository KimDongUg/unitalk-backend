const { query } = require('../config/database');

const Report = {
  async create(reporterId, reportedId, reason) {
    const result = await query(
      `INSERT INTO reports (reporter_id, reported_id, reason)
       VALUES ($1, $2, $3)
       RETURNING id, reporter_id, reported_id, reason, status, created_at`,
      [reporterId, reportedId, reason]
    );
    return result.rows[0];
  },

  async findAll({ status, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    let sql = `
      SELECT r.*,
        reporter.name AS reporter_name,
        reported.name AS reported_name
      FROM reports r
      JOIN users reporter ON reporter.id = r.reporter_id
      JOIN users reported ON reported.id = r.reported_id
    `;
    const params = [];
    if (status) {
      params.push(status);
      sql += ` WHERE r.status = $${params.length}`;
    }
    sql += ` ORDER BY r.created_at DESC`;
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);
    return result.rows;
  },

  async updateStatus(reportId, status) {
    const result = await query(
      `UPDATE reports SET status = $1 WHERE id = $2
       RETURNING id, status`,
      [status, reportId]
    );
    return result.rows[0] || null;
  },

  async countByReported(reportedId) {
    const result = await query(
      `SELECT COUNT(*) as count FROM reports WHERE reported_id = $1`,
      [reportedId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Report;
