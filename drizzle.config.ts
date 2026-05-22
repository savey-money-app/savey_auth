import { defineConfig } from 'drizzle-kit';
import { requiredEnv } from './src/env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db.ts',
  out: './drizzle',
  dbCredentials: {
    url: requiredEnv('DATABASE_URL'),
  },
  schemaFilter: ['savey_auth'],
});
