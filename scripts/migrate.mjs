import { runner } from 'node-pg-migrate';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
await runner({
  databaseUrl: process.env.DATABASE_URL,
  dir: 'migrations',
  direction: 'up',
  migrationsTable: 'schema_migrations',
  count: Infinity,
  checkOrder: true,
  verbose: false,
});
