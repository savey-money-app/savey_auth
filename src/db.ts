import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;

// Set search_path so all Better Auth tables land in the savey_auth schema.
// postgres-js passes these as connection-level SET commands on every new connection.
export const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: {
    search_path: 'savey_auth',
  },
});

export const db = drizzle(client);
