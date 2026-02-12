const { query } = require('../config/database');

const University = {
  async findById(id) {
    const result = await query(
      `SELECT id, name, name_en, domain, country, created_at
       FROM universities WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findAll({ search, country } = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR name_en ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (country) {
      conditions.push(`country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT id, name, name_en, domain, country, created_at
       FROM universities ${where}
       ORDER BY name`,
      params
    );
    return result.rows;
  },

  async findByDomain(domain) {
    const result = await query(
      `SELECT id, name, name_en, domain, country, created_at
       FROM universities WHERE domain = $1`,
      [domain]
    );
    return result.rows[0] || null;
  },
};

module.exports = University;
