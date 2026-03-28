import { Pool } from 'pg';

// pg Pool with search_path set to savey_auth schema for all connections.
// Better Auth uses this pool directly — no Drizzle needed.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});

// Set search_path on every new connection so Better Auth tables
// are resolved inside the savey_auth schema.
pool.on('connect', (client) => {
  client.query("SET search_path TO savey_auth").catch(() => {});
});
