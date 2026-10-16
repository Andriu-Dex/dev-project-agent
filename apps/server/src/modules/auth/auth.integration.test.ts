import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from 'fastify';
import { buildApp } from '../../app.js';
import { hashPassword } from './password.js';
import { createLocalUser, resetLocalPassword } from './admin.js';
import { PostgresSessionStore, SESSION_ABSOLUTE_MS } from './session-store.js';

const enabled = process.env.RUN_AUTH_DB_TESTS === 'true';
describe.skipIf(!enabled)('PostgreSQL-backed access control', () => {
  const origin = 'http://127.0.0.1:5174';
  const secret = randomBytes(48).toString('hex');
  const testPassword = randomBytes(24).toString('hex');
  const testLogin = 'test-' + randomBytes(8).toString('hex');
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let app: ReturnType<typeof buildApp>;
  let managerId: string;
  let projectId: string;
  let viewerLogin: string;
  const makeApp = () => buildApp({ checkDatabase: async () => {}, auth: {
    database: client, sessionSecret: secret, allowedOrigins: [origin], secureCookies: false,
  } });

  function cookieFrom(response: { headers: Record<string, unknown> }) {
    const value = response.headers['set-cookie'];
    const cookies = Array.isArray(value) ? value : [value];
    return cookies.reverse().find(item => typeof item === 'string' && item.startsWith('dpa_session='))?.split(';')[0] as string | undefined;
  }
  async function anonymousSession() {
    const response = await app.inject({ method: 'GET', url: '/api/v1/session' });
    expect(response.statusCode).toBe(200);
    return { cookie: cookieFrom(response)!, csrfToken: response.json().csrfToken as string };
  }
  async function login(loginName = testLogin) {
    const anonymous = await anonymousSession();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/session/login',
      headers: { origin, cookie: anonymous.cookie, 'x-csrf-token': anonymous.csrfToken },
      payload: { login: loginName, password: testPassword },
    });
    expect(response.statusCode).toBe(200);
    return { response, cookie: cookieFrom(response)!, csrfToken: response.json().csrfToken as string, oldCookie: anonymous.cookie };
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    client = await pool.connect();
    await client.query('BEGIN');
    const project = await client.query<{ id: string }>('INSERT INTO projects (name) VALUES ($1) RETURNING id', ['Authentication verification']);
    projectId = project.rows[0]!.id;
    const passwordHash = await hashPassword(testPassword);
    const manager = await client.query<{ id: string }>('INSERT INTO users (login, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id', [testLogin, 'Test manager', passwordHash]);
    managerId = manager.rows[0]!.id;
    viewerLogin = testLogin + '-viewer';
    const viewer = await client.query<{ id: string }>('INSERT INTO users (login, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id', [viewerLogin, 'Test viewer', passwordHash]);
    await client.query("INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, 'manager'), ($1, $3, 'viewer')", [projectId, managerId, viewer.rows[0]!.id]);
  });
  beforeEach(async () => {
    if (app) await app.close();
    app = makeApp();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    if (pool) await pool.end();
  });

  it('requires authentication for project data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/projects/current' });
    expect(response.statusCode).toBe(401);
  });

  it('rotates the session, persists it across app restart, and never exposes password hashes', async () => {
    const loggedIn = await login();
    expect(loggedIn.cookie).not.toBe(loggedIn.oldCookie);
    expect(String(loggedIn.response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(loggedIn.response.headers['set-cookie'])).toContain('SameSite=Lax');
    expect(loggedIn.response.body).not.toContain('password_hash');
    expect(loggedIn.response.body).not.toContain('$argon2');
    await app.close();
    app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie: loggedIn.cookie } });
    expect(response.json()).toMatchObject({ authenticated: true, user: { id: managerId }, project: { role: 'manager' } });
    const oldSession = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie: loggedIn.oldCookie } });
    expect(oldSession.json().authenticated).toBe(false);
  });

  it('rejects login without CSRF or from a foreign origin', async () => {
    const anonymous = await anonymousSession();
    for (const headers of [
      { origin, cookie: anonymous.cookie },
      { origin: 'http://untrusted.example', cookie: anonymous.cookie, 'x-csrf-token': anonymous.csrfToken },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/session/login', headers, payload: { login: testLogin, password: testPassword } });
      expect(response.statusCode).toBe(403);
    }
  });

  it('rejects unknown and incorrect credentials with the same response', async () => {
    const anonymous = await anonymousSession();
    for (const [loginName, value] of [[testLogin, 'incorrect-password'], ['missing-' + randomBytes(8).toString('hex'), testPassword]]) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/session/login', headers: { origin, cookie: anonymous.cookie, 'x-csrf-token': anonymous.csrfToken }, payload: { login: loginName, password: value } });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('enforces current project membership and manager permissions on the server', async () => {
    const manager = await login();
    const members = await app.inject({ method: 'GET', url: '/api/v1/projects/' + projectId + '/members', headers: { cookie: manager.cookie } });
    expect(members.statusCode).toBe(200);
    expect(members.json().members).toHaveLength(2);
    const viewer = await login(viewerLogin);
    expect(viewer.response.json().project.canManageProject).toBe(false);
    const denied = await app.inject({ method: 'GET', url: '/api/v1/projects/' + projectId + '/members', headers: { cookie: viewer.cookie } });
    expect(denied.statusCode).toBe(403);
    const crossProject = await app.inject({ method: 'GET', url: '/api/v1/projects/' + randomUUID() + '/members', headers: { cookie: manager.cookie } });
    expect(crossProject.statusCode).toBe(404);
    await client.query('UPDATE project_memberships SET active = false WHERE project_id = $1 AND user_id = $2', [projectId, managerId]);
    try {
      const revoked = await app.inject({ method: 'GET', url: '/api/v1/projects/current', headers: { cookie: manager.cookie } });
      expect(revoked.statusCode).toBe(403);
    } finally {
      await client.query('UPDATE project_memberships SET active = true WHERE project_id = $1 AND user_id = $2', [projectId, managerId]);
    }
  });

  it('revokes logout sessions and requires a fresh CSRF token after rotation', async () => {
    const loggedIn = await login();
    const missingCsrf = await app.inject({ method: 'POST', url: '/api/v1/session/logout', headers: { origin, cookie: loggedIn.cookie } });
    expect(missingCsrf.statusCode).toBe(403);
    const response = await app.inject({ method: 'POST', url: '/api/v1/session/logout', headers: { origin, cookie: loggedIn.cookie, 'x-csrf-token': loggedIn.csrfToken } });
    expect(response.statusCode).toBe(204);
    const replay = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie: loggedIn.cookie } });
    expect(replay.json().authenticated).toBe(false);
  });

  it('invalidates sessions after password recovery', async () => {
    const loggedIn = await login();
    await resetLocalPassword(client, testLogin, await hashPassword(testPassword));
    const response = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie: loggedIn.cookie } });
    expect(response.json().authenticated).toBe(false);
  });

  it('rejects inactive accounts without revealing their status', async () => {
    await client.query('UPDATE users SET active = false WHERE id = $1', [managerId]);
    try {
      const anonymous = await anonymousSession();
      const response = await app.inject({ method: 'POST', url: '/api/v1/session/login', headers: { origin, cookie: anonymous.cookie, 'x-csrf-token': anonymous.csrfToken }, payload: { login: testLogin, password: testPassword } });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('INVALID_CREDENTIALS');
    } finally {
      await client.query('UPDATE users SET active = true WHERE id = $1', [managerId]);
    }
  });

  it('applies a bounded login attempt limit', async () => {
    const anonymous = await anonymousSession();
    let response;
    for (let count = 0; count < 11; count++) {
      response = await app.inject({ method: 'POST', url: '/api/v1/session/login', headers: { origin, cookie: anonymous.cookie, 'x-csrf-token': anonymous.csrfToken }, payload: { login: testLogin, password: 'incorrect-password' } });
    }
    expect(response!.statusCode).toBe(429);
  });

  it('does not resurrect a revoked session and enforces absolute and idle expiration', async () => {
    const store = new PostgresSessionStore(client);
    const key = randomUUID();
    const sessionData: Session = { cookie: { originalMaxAge: 1_800_000 }, authenticatedAt: Date.now(), userId: managerId };
    const set = (id: string, value: Session) => new Promise<void>((resolve, reject) => store.set(id, value, error => error ? reject(error) : resolve()));
    const get = (id: string) => new Promise<Session | null | undefined>((resolve, reject) => store.get(id, (error, value) => error ? reject(error) : resolve(value)));
    await set(key, sessionData);
    await new Promise<void>((resolve, reject) => store.destroy(key, error => error ? reject(error) : resolve()));
    await set(key, sessionData);
    expect(await get(key)).toBeNull();
    const expiredKey = randomUUID();
    await set(expiredKey, { ...sessionData, authenticatedAt: Date.now() - SESSION_ABSOLUTE_MS - 1 });
    expect(await get(expiredKey)).toBeNull();
    const idleKey = randomUUID();
    await set(idleKey, sessionData);
    await client.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND revoked_at IS NULL", [managerId]);
    expect(await get(idleKey)).toBeNull();
  });

  it('creates local accounts with membership and audit in the caller transaction', async () => {
    const loginName = 'admin-test-' + randomBytes(8).toString('hex');
    const id = await createLocalUser(client, { login: loginName, displayName: 'Administration verification', passwordHash: await hashPassword(testPassword), role: 'viewer' });
    const memberships = await client.query('SELECT role FROM project_memberships WHERE user_id = $1', [id]);
    expect(memberships.rows).toEqual([{ role: 'viewer' }]);
    const audit = await client.query("SELECT action FROM audit_events WHERE resource_id = $1 AND action = 'auth.user.create'", [id]);
    expect(audit.rowCount).toBe(1);
  });
});
