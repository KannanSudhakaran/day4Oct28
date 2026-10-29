const pool = require('./db');

const COLUMNS = 'customer_id, name, email, phone, created_at, sales_user_id';

// Every function is scoped to userId (the owning sales user); a foreign id behaves like a missing row.

async function getAll(userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE sales_user_id = $1 ORDER BY customer_id`,
    [userId]
  );
  return rows;
}

async function getById(userId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE customer_id = $1 AND sales_user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

async function searchByName(userId, name) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE sales_user_id = $1 AND name ILIKE $2 ORDER BY customer_id`,
    [userId, `%${name}%`]
  );
  return rows;
}

async function create(userId, { name, email, phone }) {
  const { rows } = await pool.query(
    `INSERT INTO customer (name, email, phone, sales_user_id) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [name, email ?? null, phone ?? null, userId]
  );
  return rows[0];
}

async function update(userId, id, { name, email, phone }) {
  const { rows } = await pool.query(
    `UPDATE customer
        SET name = COALESCE($3, name),
            email = COALESCE($4, email),
            phone = COALESCE($5, phone)
      WHERE customer_id = $1 AND sales_user_id = $2
      RETURNING ${COLUMNS}`,
    [id, userId, name ?? null, email ?? null, phone ?? null]
  );
  return rows[0] || null;
}

async function remove(userId, id) {
  const { rows } = await pool.query(
    `DELETE FROM customer WHERE customer_id = $1 AND sales_user_id = $2 RETURNING ${COLUMNS}`,
    [id, userId]
  );
  return rows[0] || null;
}

module.exports = { getAll, getById, searchByName, create, update, remove };
