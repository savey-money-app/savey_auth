import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { signJWT } from './jwt';

type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

type AuthSession = {
  user: AuthUser;
};

export type AuthRoutes = {
  api: {
    signInEmail: (input: {
      body: { email: string; password: string };
      asResponse: false;
    }) => Promise<{ user?: AuthUser | null } | null>;
    signUpEmail: (input: {
      body: { email: string; password: string; name: string };
      asResponse: false;
    }) => Promise<{ user?: AuthUser | null } | null>;
    getSession: (input: { headers: Headers }) => Promise<AuthSession | null>;
  };
  handler: (request: Request) => Response | Promise<Response>;
};

function invalidCredentialMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid') ||
    normalized.includes('password') ||
    normalized.includes('credentials')
  );
}

function existingAccountMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already exists') ||
    normalized.includes('duplicate') ||
    normalized.includes('unique')
  );
}

export function createApp(auth: AuthRoutes, jwtSecret: string): Hono {
  const app = new Hono();

  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  /**
   * Sign-in wrapper: calls Better Auth then returns HS256 JWT for FastAPI.
   */
  app.post('/api/auth/sign-in/email', async (c) => {
    let body: { email: string; password: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid request body' }, 400);
    }

    try {
      const result = await auth.api.signInEmail({
        body: { email: body.email, password: body.password },
        asResponse: false,
      });

      if (!result?.user) {
        return c.json({ message: 'Invalid email or password' }, 401);
      }

      const token = await signJWT(
        {
          sub: result.user.id,
          email: result.user.email,
          name: result.user.name ?? '',
        },
        jwtSecret,
      );
      return c.json({
        token,
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      if (invalidCredentialMessage(message)) {
        return c.json({ message: 'Invalid email or password' }, 401);
      }
      console.error('[sign-in] error:', err);
      return c.json({ message: 'Internal server error' }, 500);
    }
  });

  /**
   * Sign-up wrapper: creates Better Auth user then returns HS256 JWT.
   */
  app.post('/api/auth/sign-up/email', async (c) => {
    let body: { email: string; password: string; name?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: 'Invalid request body' }, 400);
    }

    try {
      const result = await auth.api.signUpEmail({
        body: { email: body.email, password: body.password, name: body.name ?? '' },
        asResponse: false,
      });

      if (!result?.user) {
        return c.json({ message: 'Registration failed' }, 400);
      }

      const token = await signJWT(
        {
          sub: result.user.id,
          email: result.user.email,
          name: result.user.name ?? '',
        },
        jwtSecret,
      );
      return c.json(
        {
          token,
          user: { id: result.user.id, email: result.user.email, name: result.user.name },
        },
        201,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (existingAccountMessage(message)) {
        return c.json({ message: 'An account with this email already exists' }, 409);
      }
      console.error('[sign-up] error:', err);
      return c.json({ message }, 400);
    }
  });

  /**
   * Token refresh: given a valid Better Auth session, issue a fresh JWT.
   * Mobile app calls this when the 15-min access token expires.
   */
  app.post('/api/auth/token/refresh', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const token = await signJWT(
      { sub: session.user.id, email: session.user.email },
      jwtSecret,
    );
    return c.json({ token });
  });

  /**
   * Internal endpoint: validate a Better Auth session and return user info.
   * Used by services that need to verify a session cookie (not a JWT).
   */
  app.get('/internal/session', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    return c.json({ user_id: session.user.id, email: session.user.email });
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // OAuth callbacks, session management, CSRF, and other Better Auth routes.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  return app;
}
