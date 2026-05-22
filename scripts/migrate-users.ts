/**
 * One-time migration: import existing users from savey.users into Better Auth.
 *
 * Better Auth uses bcrypt natively — the existing hashes from FastAPI (also bcrypt)
 * are directly compatible. No password resets required.
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/migrate-users.ts
 */
import postgres from 'postgres';
import { requiredEnv } from '../src/env';

const DATABASE_URL = requiredEnv('DATABASE_URL');

interface SaveyUser {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  created_at: Date;
}

async function main() {
  const sql = postgres(DATABASE_URL);

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
      // Use fully-qualified schema names — no reliance on search_path.
      const inserted = await sql`
        INSERT INTO savey_auth."user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
        VALUES (
          ${user.id},
          ${user.email},
          ${user.full_name ?? ''},
          true,
          ${user.created_at},
          NOW()
        )
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `;

      if (inserted.length === 0) {
        skipped++;
        console.log(`Skipped (already exists): ${user.email}`);
        continue;
      }

      await sql`
        INSERT INTO savey_auth.account (
          id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
        )
        VALUES (
          ${crypto.randomUUID()},
          ${user.id},
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
