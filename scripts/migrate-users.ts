/**
 * One-time migration: import existing users from savey.users into Better Auth.
 *
 * Better Auth uses bcrypt natively — the existing hashes from FastAPI (also bcrypt)
 * are directly compatible. No password resets required.
 *
 * Automatically creates the savey_auth schema and tables if they don't exist.
 *
 * Usage:
 *   DATABASE_URL=... JWT_SECRET=... bun run scripts/migrate-users.ts
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
      // search_path is already set to savey_auth — no schema prefix needed
      const inserted = await sql`
        INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
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

      // Insert credential account with the existing bcrypt hash
      await sql`
        INSERT INTO accounts (
          id, account_id, provider_id, user_id, password, created_at, updated_at
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
        ON CONFLICT (provider_id, account_id) DO NOTHING
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
