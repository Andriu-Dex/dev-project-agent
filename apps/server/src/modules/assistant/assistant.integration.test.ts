import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { buildApp } from '../../app.js';
import { hashPassword } from '../auth/password.js';
import type { AgentProvider } from '../../providers/agents.js';
import type { TrelloDatabase } from '../../integrations/trello/service.js';
describe.skipIf(process.env.RUN_AUTH_DB_TESTS !== 'true')('Conversational permissions and idempotent history', () => {
    let pool: pg.Pool, client: pg.PoolClient, app: ReturnType<typeof buildApp>, projectId: string, headers: Record<string, string>, viewer: Record<string, string>;
    const password = 'Synthetic-assistant-pass-2026', login = 'assistant-' + randomUUID(), origin = 'http://127.0.0.1:5174';
    let modelCalls = 0;
    beforeAll(async () => {
        pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
        client = await pool.connect();
        await client.query('BEGIN');
        const database = { query: (sql: string, values?: unknown[]) => client.query(sql, values) } as unknown as TrelloDatabase;
        projectId = (await client.query("INSERT INTO projects(name) VALUES('Assistant fixture') RETURNING id")).rows[0].id;
        for (const role of ['manager', 'viewer']) {
            const actor = (await client.query('INSERT INTO users(login,display_name,password_hash) VALUES($1,$2,$3) RETURNING id', [login + '-' + role, role, await hashPassword(password)])).rows[0];
            await client.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)', [projectId, actor.id, role]);
        }
        const provider = { ensureConnection: async () => { }, connections: { credentials: () => ({ entry: {} }) }, generate: async () => { modelCalls++; return { model: 'synthetic', durationMs: 1, usage: { input_tokens: 1 }, output: { intent: 'run_shell', command: 'delete', section: 'overview' } }; } } as unknown as AgentProvider;
        app = buildApp({ checkDatabase: async () => { }, auth: { database, sessionSecret: randomBytes(48).toString('hex'), allowedOrigins: [origin], secureCookies: false, assistantProvider: provider } });
        const cookie = (response: any) => String((Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [response.headers['set-cookie']]).at(-1)).split(';')[0]!;
        async function session(role: string) { const anonymous = await app.inject({ method: 'GET', url: '/api/v1/session' }); const response = await app.inject({ method: 'POST', url: '/api/v1/session/login', headers: { origin, cookie: cookie(anonymous), 'x-csrf-token': anonymous.json().csrfToken }, payload: { login: login + '-' + role, password } }); expect(response.statusCode).toBe(200); return { origin, cookie: cookie(response), 'x-csrf-token': response.json().csrfToken }; }
        headers = await session('manager');
        viewer = await session('viewer');
    });
    afterAll(async () => { await app?.close(); await client?.query('ROLLBACK'); client?.release(); await pool?.end(); });
    const path = () => `/api/v1/projects/${projectId}/assistant`;
    it('keeps a private conversation and returns the same protected response after retries', async () => { const payload = { text: '¿Qué necesita atención?', requestKey: randomUUID() }; const first = await app.inject({ method: 'POST', url: path(), headers, payload }); expect(first.statusCode).toBe(200); expect(first.json().text).toContain('Assistant fixture'); expect((await app.inject({ method: 'POST', url: path(), headers, payload })).json()).toEqual(first.json()); expect((await app.inject({ method: 'POST', url: path(), headers, payload: { ...payload, text: 'Otro contenido' } })).statusCode).toBe(409); expect((await app.inject({ method: 'GET', url: path(), headers: viewer })).json().messages).toHaveLength(0); });
    it('reads actual work status without manufacturing running jobs', async () => { const response = await app.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/work-progress`, headers }); expect(response.statusCode).toBe(200); expect(response.json().jobs).toEqual([]); expect(response.json().checkedAt).toMatch(/Z$/); });
    it('requires a card confirmation and does not execute from free text', async () => { const response = await app.inject({ method: 'POST', url: path(), headers, payload: { text: 'Generar reporte', requestKey: randomUUID() } }); expect(response.json().cards[0]).toMatchObject({ kind: 'prepare', path: `/api/v1/projects/${projectId}/reports` }); expect((await client.query('SELECT count(*)::int AS count FROM report_jobs WHERE project_id=$1', [projectId])).rows[0].count).toBe(0); });
    it('does not grant a reader mutations or model access and rejects unlisted model tools', async () => { const reader = await app.inject({ method: 'POST', url: path(), headers: viewer, payload: { text: 'Generar reporte', requestKey: randomUUID() } }); expect(reader.json().cards).toHaveLength(0); const before = modelCalls; expect((await app.inject({ method: 'POST', url: path(), headers: viewer, payload: { text: 'Hazlo', model: 'synthetic', consent: true, requestKey: randomUUID() } })).statusCode).toBe(409); expect(modelCalls).toBe(before); expect((await app.inject({ method: 'POST', url: path(), headers, payload: { text: 'Hazlo', model: 'synthetic', consent: true, requestKey: randomUUID() } })).statusCode).toBe(409); expect(modelCalls).toBe(before + 1); });
    it('rejects expired sessions, cross-project resources and missing CSRF', async () => { expect((await app.inject({ method: 'GET', url: path() })).statusCode).toBe(401); expect((await app.inject({ method: 'GET', url: `/api/v1/projects/${randomUUID()}/assistant`, headers })).statusCode).toBe(404); expect((await app.inject({ method: 'POST', url: path(), headers: { origin, cookie: headers.cookie! }, payload: { text: 'Hola', requestKey: randomUUID() } })).statusCode).toBe(403); });
});
