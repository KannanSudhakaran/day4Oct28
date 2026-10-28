const pool = require('./db');

const COLUMNS = 'customer_id, name, email, phone, created_at';

async function getAll() {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM customer ORDER BY customer_id`);
  return rows;
}

async function getById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM customer WHERE customer_id = $1`, [id]);
  return rows[0] || null;
}

async function searchByName(name) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE name ILIKE $1 ORDER BY customer_id`,
    [`%${name}%`]
  );
  return rows;
}

async function create({ name, email, phone }) {
  const { rows } = await pool.query(
    `INSERT INTO customer (name, email, phone) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [name, email ?? null, phone ?? null]
  );
  return rows[0];
}

async function update(id, { name, email, phone }) {
  const { rows } = await pool.query(
    `UPDATE customer
        SET name = COALESCE($2, name),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone)
      WHERE customer_id = $1
      RETURNING ${COLUMNS}`,
    [id, name ?? null, email ?? null, phone ?? null]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rows } = await pool.query(
    `DELETE FROM customer WHERE customer_id = $1 RETURNING ${COLUMNS}`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { getAll, getById, searchByName, create, update, remove };
