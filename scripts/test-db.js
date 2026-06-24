/**
 * Quick database connectivity + schema check.
 * Run with: npm run db:test
 *
 * Confirms the backend can reach the database (local or Neon via DATABASE_URL)
 * and that the auth tables exist.
 */

const pool = require('../src/db/connection');

(async () => {
  const target = process.env.DATABASE_URL ? 'DATABASE_URL (cloud)' : 'local DB_* fields';
  console.log(`Connecting via ${target}…`);

  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );

    console.log('✓ Connected.');

    const names = rows.map((r) => r.table_name);
    if (names.length) {
      console.log('  Tables:', names.join(', '));
    } else {
      console.log('  (no tables yet — run the schema in the Neon SQL Editor)');
    }

    const hasUsers = names.includes('users');
    const hasSession = names.includes('session');
    console.log(`  users table:   ${hasUsers ? '✓' : '✗ missing'}`);
    console.log(`  session table: ${hasSession ? '✓' : '✗ missing — express-session will auto-create it on first run'}`);

    if (hasUsers) {
      console.log('\nAll set — you can start the server with `npm run dev`.');
    } else {
      console.log('\nNext: paste the auth schema into the Neon SQL Editor, then re-run `npm run db:test`.');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Could not connect:', err.message);
    console.error('\nCheck that DATABASE_URL in .env is the full Neon connection string');
    console.error('(starts with postgresql:// and ends with ?sslmode=require).');
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
