const { Pool } = require('pg');
require('dotenv').config();

// Prefer a single connection string when provided. Cloud providers (Neon,
// Supabase, Render) hand you a DATABASE_URL and require SSL. Fall back to the
// individual fields for local development.
const pool = process.env.DATABASE_URL
  ? new Pool({
      // Strip sslmode from the URL and control TLS via the ssl option instead.
      // This avoids a noisy pg deprecation warning about sslmode semantics.
      // rejectUnauthorized:false is the pragmatic default for managed Postgres
      // (Neon/Supabase/Render) — connection is still encrypted, we just don't
      // verify the cert chain, which sidesteps CA differences across hosts.
      connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/i, ''),
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'fantasy_football',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
