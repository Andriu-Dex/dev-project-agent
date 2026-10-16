import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../modules/auth/password.js';
import type { AuthUser } from '../../modules/auth/repository.js';
import { changeTrackingPolicy, readTrackingPolicy } from '../../modules/tracking/policy.js';
import { overview, synchronize, type TrelloDatabase } from './service.js';
import { TrelloError } from './normalize.js';
import { boardFixture, boardId, listId } from './fixtures.js';

describe.skipIf(process.env.RUN_TRELLO_DB_TESTS !== 'true')('PostgreSQL Trello synchronization', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let database: TrelloDatabase;
  let projectId: string;
  let app: ReturnType<typeof buildApp>;
  const origin = 'http://127.0.0.1:5174';
  const loginName = 'trello-test-' + randomBytes(8).toString('hex');
  const testPassword = randomBytes(24).toString('hex');
  const source = boardFixture();
  const cookie = (response: { headers: Record<string, unknown> }) => {
    const values = response.headers['set-cookie'];
    return (Array.isArray(values) ? values : [values]).reverse().find(value => typeof value === 'string' && value.startsWith('dpa_session='))?.split(';')[0] as string;
  };
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    client = await pool.connect();
    await client.query('BEGIN');
    // Service transactions become savepoints so every fixture remains inside the final rollback.
    database = { query: client.query.bind(client), connect: async () => ({
      query: async (sql: string, parameters?: unknown[]) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT sync_test');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT sync_test');
        if (sql === 'ROLLBACK') { await client.query('ROLLBACK TO SAVEPOINT sync_test'); return client.query('RELEASE SAVEPOINT sync_test'); }
        return client.query(sql, parameters);
      }, release: () => {},
    }) } as unknown as TrelloDatabase;
    projectId = (await client.query<{ id: string }>("INSERT INTO projects (name) VALUES ('Trello verification') RETURNING id")).rows[0]!.id;
    await client.query('INSERT INTO tracking_policy_versions (project_id, version, due_soon_hours, stale_after_minutes, confirmed) VALUES ($1,1,72,60,false)', [projectId]);
    await client.query('INSERT INTO trello_connections (project_id, board_id, operational_list_ids) VALUES ($1,$2,$3)', [projectId, boardId, JSON.stringify([listId])]);
    const passwordHash = await hashPassword(testPassword);
    for (const role of ['manager', 'viewer']) {
      const user = await client.query<{ id: string }>('INSERT INTO users (login, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id', [loginName + '-' + role, role, passwordHash]);
      await client.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1,$2,$3)', [projectId, user.rows[0]!.id, role]);
    }
    app = buildApp({ checkDatabase: async () => {}, auth: { database: client, sessionSecret: randomBytes(48).toString('hex'), allowedOrigins: [origin], secureCookies: false, trello: { database, credentials: null } } });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (client) { await client.query('ROLLBACK'); client.release(); }
    if (pool) await pool.end();
  });
  async function login(role: string) {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/session' });
    const response = await app.inject({ method: 'POST', url: '/api/v1/session/login',
      headers: { origin, cookie: cookie(anonymous), 'x-csrf-token': anonymous.json().csrfToken }, payload: { login: loginName + '-' + role, password: testPassword } });
    expect(response.statusCode).toBe(200);
    return { cookie: cookie(response), origin, 'x-csrf-token': response.json().csrfToken as string };
  }
  it('persists snapshots, compares changes, and retains the latest valid data after failure', async () => {
    const first = await synchronize(database, projectId, null, 'export', async () => ({ board: source, observedAt: new Date(2026, 0, 1) }));
    expect(first.changeCount).toBe(0);
    const changed = structuredClone(source);
    changed.cards[0]!.due = '2026-10-12T22:00:00Z';
    const second = await synchronize(database, projectId, null, 'api', async () => ({ board: changed, observedAt: new Date(2026, 0, 2) }));
    expect(second.changeCount).toBe(1);
    await expect(synchronize(database, projectId, null, 'api', async () => { throw new TrelloError('ACCESS_DENIED'); })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    const state = await overview(client, projectId, false);
    expect(state?.latest?.id).toBe(second.snapshotId);
    expect(state?.lastAttempt).toMatchObject({ status: 'failed', errorCode: 'ACCESS_DENIED' });
    expect((await client.query('SELECT action FROM audit_events WHERE project_id=$1', [projectId])).rows).toHaveLength(3);
  });
  it('rejects older exports and wrong boards without replacing current data', async () => {
    const before = await overview(client, projectId, false);
    await expect(synchronize(database, projectId, null, 'export', async () => ({ board: source, observedAt: new Date(2025, 0, 1) }))).rejects.toMatchObject({ code: 'OLDER_SOURCE' });
    await expect(synchronize(database, projectId, null, 'api', async () => ({ board: { ...source, id: 'e'.repeat(24) }, observedAt: new Date() }))).rejects.toMatchObject({ code: 'BOARD_MISMATCH' });
    expect((await overview(client, projectId, false))?.latest?.id).toBe(before?.latest?.id);
  });
  it('refuses concurrent synchronization before contacting Trello', async () => {
    const competing = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
    let contacted = false;
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`trello:${projectId}`]);
    try {
      await expect(synchronize(competing, projectId, null, 'api', async () => {
        contacted = true;
        return { board: source, observedAt: new Date() };
      })).rejects.toMatchObject({ code: 'SYNC_BUSY' });
      expect(contacted).toBe(false);
    } finally { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`trello:${projectId}`]); await competing.end(); }
  });
  it('protects reads, disallows viewer sync and cross-project access, and enforces CSRF', async () => {
    const path = `/api/v1/projects/${projectId}/trello`;
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
    const viewer = await login('viewer');
    expect((await app.inject({ method: 'GET', url: path, headers: viewer })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: path + '/sync', headers: viewer })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects/00000000-0000-0000-0000-000000000000/trello', headers: viewer })).statusCode).toBe(404);
    const manager = await login('manager');
    expect((await app.inject({ method: 'POST', url: path + '/sync', headers: { cookie: manager.cookie, origin } })).statusCode).toBe(403);
    const response = await app.inject({ method: 'POST', url: path + '/sync', headers: manager });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('CREDENTIALS_REQUIRED');
  });
  it('restricts policy changes to managers with CSRF and validates threshold bounds', async () => {
    const path = `/api/v1/projects/${projectId}/tracking-policy`;
    const payload = { expectedVersion: 1, dueSoonHours: 12, staleAfterMinutes: 120 };
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
    const viewer = await login('viewer');
    expect((await app.inject({ method: 'GET', url: path, headers: viewer })).json()).toMatchObject({ version: 1, confirmed: false });
    expect((await app.inject({ method: 'PUT', url: path, headers: viewer, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects/00000000-0000-0000-0000-000000000000/tracking-policy', headers: viewer })).statusCode).toBe(404);
    const manager = await login('manager');
    expect((await app.inject({ method: 'PUT', url: path, headers: { cookie: manager.cookie, origin }, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: path, headers: { ...manager, origin: 'https://untrusted.example' }, payload })).statusCode).toBe(403);
    for (const invalid of [{ dueSoonHours: 0 }, { dueSoonHours: 721 }, { dueSoonHours: 1.5 }, { staleAfterMinutes: 0 }, { staleAfterMinutes: 10081 }, { expectedVersion: 0 }]) {
      expect((await app.inject({ method: 'PUT', url: path, headers: manager, payload: { ...payload, ...invalid } })).statusCode).toBe(400);
    }
    expect((await client.query('SELECT version FROM tracking_policy_versions WHERE project_id=$1', [projectId])).rows).toHaveLength(1);
  });
  it('applies saved values immediately, retains version history and rejects stale edits', async () => {
    const changed = structuredClone(source);
    changed.cards[0]!.due = new Date(Date.now() + 24 * 3_600_000).toISOString();
    await synchronize(database, projectId, null, 'api', async () => ({ board: changed, observedAt: new Date(Date.now() - 90 * 60_000) }));
    const headers = await login('manager');
    const path = `/api/v1/projects/${projectId}`;
    const before = (await app.inject({ method: 'GET', url: path + '/tracking', headers })).json();
    expect(before.source.freshness).toBe('stale');
    expect(before.summary.activities.dueSoon).toBe(1);
    const payload = { expectedVersion: 1, dueSoonHours: 12, staleAfterMinutes: 120 };
    const saved = await app.inject({ method: 'PUT', url: path + '/tracking-policy', headers, payload });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ version: 2, confirmed: true, dueSoonHours: 12, staleAfterMinutes: 120, changedBy: { displayName: 'manager' } });
    const after = (await app.inject({ method: 'GET', url: path + '/tracking', headers })).json();
    expect(after.source.snapshotId).toBe(before.source.snapshotId);
    expect(after.source.freshness).toBe('recent');
    expect(after.summary.activities.dueSoon).toBe(0);
    expect(after.policy).toMatchObject({ version: 'tracking-v1/config-v2', dueSoonHours: 12, staleAfterMinutes: 120, thresholdsConfirmed: true });
    const conflict = await app.inject({ method: 'PUT', url: path + '/tracking-policy', headers, payload });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('POLICY_CONFLICT');
    const history = await client.query('SELECT version, due_soon_hours, stale_after_minutes, confirmed FROM tracking_policy_versions WHERE project_id=$1 ORDER BY version', [projectId]);
    expect(history.rows).toEqual([{ version: 1, due_soon_hours: 72, stale_after_minutes: 60, confirmed: false }, { version: 2, due_soon_hours: 12, stale_after_minutes: 120, confirmed: true }]);
    const audits = await client.query("SELECT actor_id, resource_id, outcome FROM audit_events WHERE project_id=$1 AND action='tracking.policy.update' AND outcome='succeeded'", [projectId]);
    expect(audits.rows).toEqual([{ actor_id: saved.json().changedBy.id, resource_id: `${projectId}:v2`, outcome: 'succeeded' }]);
  });
  it('grants the application append-only policy history permissions', async () => {
    const runtime = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
    try {
      const permissions = await runtime.query("SELECT has_table_privilege(current_user,'tracking_policy_versions','SELECT') AS read, has_table_privilege(current_user,'tracking_policy_versions','INSERT') AS append, has_table_privilege(current_user,'tracking_policy_versions','UPDATE') AS update, has_table_privilege(current_user,'tracking_policy_versions','DELETE') AS delete");
      expect(permissions.rows[0]).toEqual({ read: true, append: true, update: false, delete: false });
    } finally { await runtime.end(); }
  });
  it('rolls back policy insertion if auditing fails and rechecks revoked permissions', async () => {
    const actor = (await client.query<AuthUser>('SELECT * FROM users WHERE login=$1', [loginName + '-manager'])).rows[0]!;
    const failing = { ...database, connect: async () => {
      const transaction = await database.connect();
      return { query: async (sql: string, parameters?: unknown[]) => {
        if (sql.startsWith('INSERT INTO audit_events')) throw new Error('Simulated audit failure.');
        return transaction.query(sql, parameters);
      }, release: () => transaction.release() };
    } } as unknown as TrelloDatabase;
    const values = { expectedVersion: 2, dueSoonHours: 24, staleAfterMinutes: 30 };
    await expect(changeTrackingPolicy(failing, projectId, actor, values)).rejects.toThrow('Simulated audit failure.');
    expect(await readTrackingPolicy(client, projectId)).toMatchObject({ version: 2, dueSoonHours: 12, staleAfterMinutes: 120 });
    await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2', [projectId, actor.id]);
    try {
      await expect(changeTrackingPolicy(database, projectId, actor, values)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((await client.query('SELECT version FROM tracking_policy_versions WHERE project_id=$1', [projectId])).rows).toHaveLength(2);
    } finally { await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2', [projectId, actor.id]); }
  });
  it('reads persisted policy after rebuilding the service and accepts valid range limits', async () => {
    await app.close();
    app = buildApp({ checkDatabase: async () => {}, auth: { database: client, sessionSecret: randomBytes(48).toString('hex'), allowedOrigins: [origin], secureCookies: false, trello: { database, credentials: null } } });
    const headers = await login('manager');
    const path = `/api/v1/projects/${projectId}/tracking-policy`;
    expect((await app.inject({ method: 'GET', url: path, headers })).json()).toMatchObject({ version: 2, dueSoonHours: 12, staleAfterMinutes: 120 });
    for (const payload of [{ expectedVersion: 2, dueSoonHours: 720, staleAfterMinutes: 10080 }, { expectedVersion: 3, dueSoonHours: 1, staleAfterMinutes: 1 }]) {
      const saved = await app.inject({ method: 'PUT', url: path, headers, payload });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ version: payload.expectedVersion + 1, dueSoonHours: payload.dueSoonHours, staleAfterMinutes: payload.staleAfterMinutes });
    }
  });
});
