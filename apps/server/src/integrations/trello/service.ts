import type pg from 'pg';
import type { TrelloOverview, TrelloSnapshot, TrelloChange } from '@dev-project-agent/contracts';
import type { AuthDatabase } from '../../modules/auth/repository.js';
import { compareSnapshots, normalizeBoard, TrelloError } from './normalize.js';

export type TrelloDatabase = Pick<pg.Pool, 'query' | 'connect'>;
interface Connection { board_id: string; operational_list_ids: string[] }
export async function getConnection(database: AuthDatabase, projectId: string): Promise<Connection | null> {
  const result = await database.query<Connection>('SELECT board_id, operational_list_ids FROM trello_connections WHERE project_id = $1', [projectId]);
  return result.rows[0] ?? null;
}

export async function overview(database: AuthDatabase, projectId: string, apiConfigured: boolean): Promise<TrelloOverview | null> {
  const connection = await getConnection(database, projectId);
  if (!connection) return null;
  const snapshots = await database.query<{ id: string; source: 'api' | 'export'; observed_at: Date; imported_at: Date; data: TrelloSnapshot; changes: TrelloChange[] }>(
    'SELECT id, source, observed_at, imported_at, data, changes FROM trello_snapshots WHERE project_id = $1 ORDER BY imported_at DESC, id DESC LIMIT 1', [projectId],
  );
  const attempts = await database.query<{ status: 'succeeded' | 'failed'; attempted_at: Date; error_code: string | null }>(
    'SELECT status, attempted_at, error_code FROM trello_sync_attempts WHERE project_id = $1 ORDER BY attempted_at DESC, id DESC LIMIT 1', [projectId],
  );
  const row = snapshots.rows[0];
  const attempt = attempts.rows[0];
  return {
    connection: { boardId: connection.board_id, apiConfigured },
    latest: row ? { id: row.id, source: row.source, observedAt: row.observed_at.toISOString(), importedAt: row.imported_at.toISOString(), data: row.data, changes: row.changes } : null,
    lastAttempt: attempt ? { status: attempt.status, attemptedAt: attempt.attempted_at.toISOString(), errorCode: attempt.error_code } : null,
  };
}

export async function synchronize(database: TrelloDatabase, projectId: string, actorId: string | null,
  source: 'api' | 'export', load: (boardId: string) => Promise<{ board: unknown; observedAt: Date }>) {
  const client = await database.connect();
  let locked = false;
  let transaction = false;
  try {
    const lock = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [`trello:${projectId}`]);
    if (!lock.rows[0]?.acquired) throw new TrelloError('SYNC_BUSY');
    locked = true;
    const connection = await getConnection(client, projectId);
    if (!connection) throw new TrelloError('NOT_CONFIGURED');
    const { board, observedAt } = await load(connection.board_id);
    const data = normalizeBoard(board, connection.board_id, connection.operational_list_ids);
    await client.query('BEGIN');
    transaction = true;
    const previous = await client.query<{ data: TrelloSnapshot; observed_at: Date }>('SELECT data, observed_at FROM trello_snapshots WHERE project_id = $1 ORDER BY imported_at DESC, id DESC LIMIT 1', [projectId]);
    if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + 60_000) throw new TrelloError('INVALID_SOURCE_DATE');
    if (previous.rows[0] && observedAt < previous.rows[0].observed_at) throw new TrelloError('OLDER_SOURCE');
    const changes = compareSnapshots(previous.rows[0]?.data ?? null, data);
    const result = await client.query<{ id: string }>(
      'INSERT INTO trello_snapshots (project_id, source, observed_at, data, changes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [projectId, source, observedAt, JSON.stringify(data), JSON.stringify(changes)],
    );
    await client.query("INSERT INTO trello_sync_attempts (project_id, status) VALUES ($1, 'succeeded')", [projectId]);
    await audit(client, projectId, actorId, 'succeeded', result.rows[0]!.id);
    await client.query('COMMIT');
    transaction = false;
    return { snapshotId: result.rows[0]!.id, changeCount: changes.length };
  } catch (error) {
    if (transaction) await client.query('ROLLBACK');
    const safe = error instanceof TrelloError ? error : new TrelloError('STORAGE_UNAVAILABLE');
    if (locked && await getConnection(client, projectId)) {
      await client.query('BEGIN');
      try {
        await client.query("INSERT INTO trello_sync_attempts (project_id, status, error_code) VALUES ($1, 'failed', $2)", [projectId, safe.code]);
        await audit(client, projectId, actorId, 'failed', safe.code);
        await client.query('COMMIT');
      } catch { await client.query('ROLLBACK'); }
    }
    throw safe;
  } finally {
    let discard = false;
    try { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`trello:${projectId}`]); }
    catch (error) { discard = true; throw error; }
    finally { client.release(discard); }
  }
}

async function audit(database: AuthDatabase, projectId: string, actorId: string | null, outcome: string, resourceId: string) {
  await database.query('INSERT INTO audit_events (project_id, actor_type, actor_id, action, resource_type, resource_id, outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [projectId, actorId ? 'user' : 'system', actorId, 'trello.sync', 'trello_snapshot', resourceId, outcome]);
}
