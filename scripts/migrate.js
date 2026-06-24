/**
 * Apply the auth schema to the configured database.
 * Run with: npm run db:setup
 *
 * Idempotent (CREATE TABLE IF NOT EXISTS), so it's safe to run against a fresh
 * Neon database or re-run after changes. Use this on prod too after deploy.
 */

const fs = require('fs');
const path = require('path');
const pool = require('../src/db/connection');

(async () => {
  const file = path.join(__dirname, '..', 'src', 'db', 'auth-schema.sql');
  const sql = fs.readFileSync(file, 'utf8');

  const target = process.env.DATABASE_URL ? 'DATABASE_URL (cloud)' : 'local DB_* fields';
  console.log(`Applying auth-schema.sql via ${target}…`);

  try {
    await pool.query(sql);
    console.log('✓ Schema applied.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
