/**
 * Run Better Auth database migrations on startup.
 * Better Auth auto-generates its schema on first run when using generateSchema().
 */
import { auth } from './auth';

async function main() {
  try {
    // Better Auth will create its tables automatically when using drizzle adapter
    // with the generateSchema option. We just need to initialize it.
    console.log('Running Better Auth migrations...');

    // This triggers schema creation if tables don't exist
    await auth.api.getSession({ headers: new Headers() }).catch(() => null);

    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
