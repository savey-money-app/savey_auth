/**
 * Creates the savey_auth Postgres schema and all Better Auth tables.
 * Idempotent — safe to run on every container start.
 *
 * Better Auth's native pg adapter uses camelCase column names
 * (emailVerified, createdAt, updatedAt, userId, etc.)
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

  // Drop old tables (any schema — handles renamed/re-ordered columns).
  // Order matters: dependents first.
  await sql`DROP TABLE IF EXISTS session CASCADE`;
  await sql`DROP TABLE IF EXISTS account CASCADE`;
  await sql`DROP TABLE IF EXISTS verification CASCADE`;
  await sql`DROP TABLE IF EXISTS "user" CASCADE`;
  // Also clean up any old plural-named tables
  await sql`DROP TABLE IF EXISTS sessions CASCADE`;
  await sql`DROP TABLE IF EXISTS accounts CASCADE`;
  await sql`DROP TABLE IF EXISTS verifications CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;

  console.log('Creating Better Auth tables...');

  await sql`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      "expiresAt" TIMESTAMP NOT NULL,
      token TEXT NOT NULL UNIQUE,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" TIMESTAMP,
      "refreshTokenExpiresAt" TIMESTAMP,
      scope TEXT,
      password TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE ("providerId", "accountId")
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      "expiresAt" TIMESTAMP NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  console.log('Schema setup complete.');
  await sql.end();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
