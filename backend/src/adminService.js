const pool = require('./db');

// Aggregate only: counts customers per sales user, never returns customer rows.
async function listSalesUsers({ q } = {}) {
  const term = q ? `%${String(q).replace(/[\%_]/g, '\$&')}%` : null;
  const { rows } = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.role, u.created_at, COUNT(c.customer_id)::int AS customer_count
     FROM app_user u
     LEFT JOIN customer c ON c.sales_user_id = u.user_id
     WHERE u.role = 'sales' AND ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)
     GROUP BY u.user_id
     ORDER BY u.created_at ASC`,
    [term]
  );
  return rows;
}

module.exports = { listSalesUsers };
