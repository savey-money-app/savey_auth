import { betterAuth } from 'better-auth';
import { pool } from './db';

export const auth = betterAuth({
  database: pool,

  baseURL: process.env.AUTH_BASE_URL ?? 'http://localhost:3002',
  secret: process.env.JWT_SECRET!,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      // Use bcrypt so migrated FastAPI hashes (also bcrypt) verify correctly.
      // Bun.password.verify auto-detects the algorithm from the hash prefix.
      hash: (password) => Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 }),
      verify: ({ hash, password }) => Bun.password.verify(password, hash),
    },
  },

  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
          },
        }
      : {}),
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});
