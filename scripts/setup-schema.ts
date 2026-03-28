/**
 * Creates the savey_auth Postgres schema and all Better Auth tables.
 * Idempotent — safe to run on every container start.
 *
 * Better Auth's native pg adapter uses SINGULAR table names:
 *   user, session, account, verification
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/setup-schema.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL!;

async function main() {
  const sql = postgres(DATABASE_URL);

  console.log('Creating savey_auth schema...');
  await sql`CREATE SCHEMA IF NOT EXISTS savey_auth`;
  await sql`SET search_path TO savey_auth`;

  console.log('Creating Better Auth tables...');

  // Better Auth native pg adapter expects SINGULAR names
  await sql`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expires_at TIMESTAMP NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TIMESTAMP,
      refresh_token_expires_at TIMESTAMP,
      scope TEXT,
      password TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (provider_id, account_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  // Drop the old plural tables if they exist from a previous failed attempt
  await sql`DROP TABLE IF EXISTS verifications CASCADE`;
  await sql`DROP TABLE IF EXISTS accounts CASCADE`;
  await sql`DROP TABLE IF EXISTS sessions CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;

  console.log('Schema setup complete.');
  await sql.end();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
