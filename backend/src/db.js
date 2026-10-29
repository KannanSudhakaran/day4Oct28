const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render requires SSL; a local Postgres usually has none
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
  max: 3, // keep connections low for serverless
});

module.exports = pool;
