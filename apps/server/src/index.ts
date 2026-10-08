import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import pg from 'pg';
import { buildApp } from './app.js';
import { authConfigFromEnvironment } from './modules/auth/config.js';

const connectionString = process.env.APP_DATABASE_URL;
if (!connectionString) throw new Error('APP_DATABASE_URL is required. Run npm run setup first.');
const port = Number(process.env.PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer between 1024 and 65535.');

const pool = new pg.Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
  statement_timeout: 3000,
  application_name: 'dev-project-agent',
});
const app = buildApp({
  checkDatabase: async () => { await pool.query('SELECT 1'); },
  logger: true,
  auth: { ...authConfigFromEnvironment(process.env), database: pool },
});
pool.on('error', () => { app.log.error('Idle database connection failed.'); });
app.addHook('onClose', async () => { await pool.end(); });

const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
try {
  await app.listen({ host: '127.0.0.1', port });
} catch {
  app.log.error('Server startup failed.');
  await app.close();
  process.exitCode = 1;
}
