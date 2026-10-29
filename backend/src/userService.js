const bcrypt = require('bcryptjs');
const pool = require('./db');

const PUBLIC = 'user_id, name, email, role, created_at';

async function create({ name, email, password }) {
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_user (name, email, password_hash, role) VALUES ($1, $2, $3, 'sales') RETURNING ${PUBLIC}`,
      [name, email, hash]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') { const err = new Error('Email already registered'); err.status = 409; throw err; }
    throw e;
  }
}

// Includes password_hash: for login verification only.
async function findByEmail(email) {
  const { rows } = await pool.query(`SELECT ${PUBLIC}, password_hash FROM app_user WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

async function getById(id) {
  const { rows } = await pool.query(`SELECT ${PUBLIC} FROM app_user WHERE user_id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { create, findByEmail, getById };
