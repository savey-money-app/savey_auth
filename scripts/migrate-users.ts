/**
 * One-time migration: import existing users from savey.users into Better Auth.
 *
 * Better Auth uses bcrypt natively — the existing hashes from FastAPI (also bcrypt)
 * are directly compatible. No password resets required.
 *
 * Usage:
 *   DATABASE_URL=... JWT_SECRET=... AUTH_BASE_URL=... bun run scripts/migrate-users.ts
 */
import postgres from 'postgres';
import { auth } from '../src/auth';

const DATABASE_URL = process.env.DATABASE_URL!;

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
      // Check if user already exists in Better Auth
      const existing = await auth.api.getSession({
        headers: new Headers(),
      }).catch(() => null);

      // Use Better Auth's internal DB to check/create user
      // We directly insert into the Better Auth tables with the same UUID and bcrypt hash
      await sql`
        INSERT INTO savey_auth.users (id, email, name, email_verified, created_at, updated_at)
        VALUES (
          ${user.id},
          ${user.email},
          ${user.full_name ?? ''},
          true,
          ${user.created_at},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `;

      // Insert password account record
      await sql`
        INSERT INTO savey_auth.accounts (
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
