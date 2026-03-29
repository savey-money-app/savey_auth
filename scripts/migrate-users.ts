/**
 * One-time migration: import existing users from savey.users into Better Auth.
 *
 * Better Auth uses bcrypt natively — the existing hashes from FastAPI (also bcrypt)
 * are directly compatible. No password resets required.
 *
 * Automatically creates the savey_auth schema and tables if they don't exist.
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/migrate-users.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL!;

interface SaveyUser {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  created_at: Date;
}

async function ensureSchema(sql: ReturnType<typeof postgres>) {
  console.log('Ensuring savey_auth schema and tables exist...');
  await sql`CREATE SCHEMA IF NOT EXISTS savey_auth`;
  await sql`SET search_path TO savey_auth`;

  // Better Auth native pg adapter expects camelCase column names
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
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      "expiresAt" TIMESTAMP NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  console.log('Schema ready.');
}

async function main() {
  const sql = postgres(DATABASE_URL);

  await ensureSchema(sql);

  console.log('Fetching users from savey schema...');
  const users = await sql<SaveyUser[]>`
    SELECT id, email, full_name, password_hash, created_at
    FROM savey.users
    ORDER BY created_at ASC
  `;

  console.log(`Found ${users.length} users to migrate.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const inserted = await sql`
        INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
        VALUES (
          ${user.id},
          ${user.email},
          ${user.full_name ?? ''},
          true,
          ${user.created_at},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;

      if (inserted.length === 0) {
        skipped++;
        console.log(`Skipped (already exists): ${user.email}`);
        continue;
      }

      await sql`
        INSERT INTO account (
          id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
        )
        VALUES (
          ${crypto.randomUUID()},
          ${user.email},
          'credential',
          ${user.id},
          ${user.password_hash},
          ${user.created_at},
          NOW()
        )
        ON CONFLICT ("providerId", "accountId") DO NOTHING
      `;

      migrated++;
      console.log(`Migrated: ${user.email} (${user.id})`);
    } catch (err) {
      failed++;
      console.error(`Failed: ${user.email}:`, err);
    }
  }

  await sql.end();
  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
