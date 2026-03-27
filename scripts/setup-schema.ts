/**
 * Creates the savey_auth Postgres schema and all Better Auth tables.
 * Must be run before the service starts for the first time and before
 * migrate-users.ts.
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

  // Set search path for this session
  await sql`SET search_path TO savey_auth`;

  console.log('Creating Better Auth tables...');

  // users
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  // sessions
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      expires_at TIMESTAMP NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  // accounts (OAuth providers + credential)
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

  // verifications
  await sql`
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  console.log('Schema setup complete.');
  await sql.end();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
