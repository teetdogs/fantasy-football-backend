/**
 * Apply all schema migrations to the configured database.
 * Run with: npm run db:setup
 *
 * Idempotent — safe to re-run. Applies files in order:
 *   auth-schema.sql, 002-espn-creds.sql, etc.
 */

const fs = require('fs');
const path = require('path');
const pool = require('../src/db/connection');

const MIGRATIONS = [
  'auth-schema.sql',
  '002-espn-creds.sql',
  '003-user-leagues.sql',
];

(async () => {
  const target = process.env.DATABASE_URL ? 'DATABASE_URL (cloud)' : 'local DB_* fields';
  console.log(`Running migrations via ${target}…`);

  try {
    for (const file of MIGRATIONS) {
      const filePath = path.join(__dirname, '..', 'src', 'db', file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    }
    console.log('All migrations applied.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
