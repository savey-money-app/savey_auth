import { Pool } from 'pg';

// Neon's pooler (PgBouncer transaction mode) blocks search_path as a startup
// parameter and doesn't preserve SET across transactions. Use the unpooled
// direct connection so search_path works correctly. The auth service has low
// concurrency so direct connections are fine.
function unpooledUrl(url: string): string {
  return url.replace('-pooler.', '.');
}

export const pool = new Pool({
  connectionString: unpooledUrl(process.env.DATABASE_URL!),
  max: 5,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', (client) => {
  client.query('SET search_path TO savey_auth').catch(() => {});
});
