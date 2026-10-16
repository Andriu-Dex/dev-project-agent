import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { TrelloSnapshot } from '@dev-project-agent/contracts';
import { buildApp } from '../../app.js';
import { hashPassword } from '../auth/password.js';
import type { TrelloDatabase } from '../../integrations/trello/service.js';

describe('Authenticated tracking API', () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const managerId = '22222222-2222-4222-8222-222222222222';
  const viewerId = '33333333-3333-4333-8333-333333333333';
  const origin = 'http://127.0.0.1:5174';
  const testPassword = randomBytes(24).toString('hex');
  let passwordHash: string;
  let app: ReturnType<typeof buildApp>;
  let latestAvailable = true;
  let readsFromTrello = 0;
  const sessions = new Map<string, unknown>();
  const observedAt = new Date(Date.now() - 30_000);
  const data: TrelloSnapshot = { board: { id: 'a'.repeat(24), name: 'Synthetic project' }, lists: [], members: [], items: [{
    id: 'b'.repeat(24), name: 'Synthetic overdue task', listId: 'c'.repeat(24), kind: 'activity', state: 'pending',
    labelNames: ['PENDIENTE'], start: new Date(Date.now() - 2 * 86_400_000).toISOString(), due: new Date(Date.now() - 86_400_000).toISOString(),
    dueComplete: false, archived: false, memberIds: ['d'.repeat(24)], qualityIssues: [],
  }] };
  const database = {
    async query(sql: string, parameters: unknown[] = []) {
      if (sql.startsWith('INSERT INTO sessions')) {
        if (parameters.length === 1) sessions.delete(parameters[0] as string);
        else sessions.set(parameters[0] as string, JSON.parse(parameters[2] as string));
        return { rows: [] };
      }
      if (sql.startsWith('SELECT payload FROM sessions')) return { rows: sessions.has(parameters[0] as string) ? [{ payload: sessions.get(parameters[0] as string) }] : [] };
      if (sql.includes('FROM users WHERE')) {
        const value = parameters[0];
        const manager = value === 'manager' || value === managerId;
        const viewer = value === 'viewer' || value === viewerId;
        return { rows: manager || viewer ? [{ id: manager ? managerId : viewerId, login: manager ? 'manager' : 'viewer', display_name: 'Test member', password_hash: passwordHash, active: true, auth_version: 1 }] : [] };
      }
      if (sql.includes('JOIN project_memberships')) return { rows: parameters[1] && parameters[1] !== projectId ? [] : [{ id: projectId, name: 'Synthetic project', time_zone: 'America/Guayaquil', role: parameters[0] === managerId ? 'manager' : 'viewer' }] };
      if (sql.startsWith('INSERT INTO audit_events')) return { rows: [] };
      if (sql.includes('FROM trello_connections')) return { rows: [{ board_id: data.board.id, operational_list_ids: [data.items[0]!.listId] }] };
      if (sql.includes('FROM tracking_policy_versions')) return { rows: [{ version: 1, due_soon_hours: 72, stale_after_minutes: 60, confirmed: false, changed_at: observedAt, changed_by: null, display_name: null }] };
      if (sql.includes('FROM trello_snapshots')) return { rows: latestAvailable ? [{ id: 'saved-snapshot', source: 'api', observed_at: observedAt, imported_at: observedAt, data, changes: [] }] : [] };
      if (sql.includes('FROM trello_sync_attempts')) return { rows: [] };
      throw new Error('Unexpected fixture query.');
    },
    async connect() { throw new Error('Tracking GET must not start a write transaction.'); },
  } as unknown as TrelloDatabase;
  const getCookie = (response: { headers: Record<string, unknown> }) => {
    const values = response.headers['set-cookie'];
    return (Array.isArray(values) ? values : [values]).reverse().find(value => typeof value === 'string' && value.startsWith('dpa_session='))?.split(';')[0] as string;
  };
  beforeAll(async () => {
    passwordHash = await hashPassword(testPassword);
    app = buildApp({ checkDatabase: async () => {}, auth: { database, sessionSecret: randomBytes(48).toString('hex'), allowedOrigins: [origin], secureCookies: false,
      trello: { database, credentials: null, fetcher: async () => { readsFromTrello++; throw new Error('External fetch is not allowed during tracking.'); } } } });
  });
  afterAll(async () => { if (app) await app.close(); });
  async function login(name: string) {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/session' });
    const response = await app.inject({ method: 'POST', url: '/api/v1/session/login', headers: { cookie: getCookie(anonymous), origin, 'x-csrf-token': anonymous.json().csrfToken }, payload: { login: name, password: testPassword } });
    expect(response.statusCode).toBe(200);
    return getCookie(response);
  }
  it('rejects anonymous requests before revealing snapshot data', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tracking` });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('Synthetic overdue task');
  });
  it('allows manager and viewer reads, attaches evidence, and never fetches Trello', async () => {
    for (const name of ['manager', 'viewer']) {
      const response = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tracking`, headers: { cookie: await login(name) } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ source: { snapshotId: 'saved-snapshot' }, summary: { activities: { overdue: 1 } } });
      expect(response.json().findings[0].evidence).toContainEqual({ field: 'state', value: 'pending' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).not.toContain('$argon2');
    }
    expect(readsFromTrello).toBe(0);
  });
  it('isolates project membership and rejects invalid project identifiers', async () => {
    const cookie = await login('viewer');
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects/44444444-4444-4444-8444-444444444444/tracking', headers: { cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/projects/invalid/tracking', headers: { cookie } })).statusCode).toBe(400);
  });
  it('reports no data instead of zero progress when no valid snapshot exists', async () => {
    const cookie = await login('viewer');
    latestAvailable = false;
    try {
      const response = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tracking`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ summary: null, source: null, findings: [] });
    } finally { latestAvailable = true; }
  });
});
