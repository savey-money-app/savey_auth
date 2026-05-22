import { createApp } from './app';
import { auth } from './auth';
import { requiredEnv } from './env';

const app = createApp(auth, requiredEnv('JWT_SECRET'));

export default { port: 3002, fetch: app.fetch };
