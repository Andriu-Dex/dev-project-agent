import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { synchronize } from '../apps/server/src/integrations/trello/service.js';
import { TrelloError } from '../apps/server/src/integrations/trello/normalize.js';

const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL, max: 2, connectionTimeoutMillis: 3000 });
try {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required.');
  const result = await pool.query<{ project_id: string }>('SELECT project_id FROM trello_connections ORDER BY project_id');
  if (result.rows.length !== 1) throw new TrelloError('SELECT_PROJECT_REQUIRED');
  const filePath = resolve(process.argv[2] ?? 'docs/utaped-trello.json');
  const metadata = await stat(filePath);
  if (metadata.size > 20_000_000) throw new TrelloError('SOURCE_TOO_LARGE');
  await synchronize(pool, result.rows[0]!.project_id, null, 'export', async () => ({
    board: JSON.parse(await readFile(filePath, 'utf8')) as unknown, observedAt: metadata.mtime,
  }));
  console.log('Trello export imported. File modification time is the source date; live access is not implied.');
} catch (error) {
  console.error('Trello export import failed:', error instanceof TrelloError ? error.code : 'IMPORT_UNAVAILABLE');
  process.exitCode = 1;
} finally { await pool.end(); }
