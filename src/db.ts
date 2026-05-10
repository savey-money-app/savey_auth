import { Pool } from 'pg';

// Pass search_path as a startup parameter via `options`.
// This is sent to Postgres at connection time (not via SET), so it survives
// Neon's PgBouncer transaction-mode multiplexing where SET is session-scoped
// and gets lost between transactions.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c search_path=savey_auth',
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});
