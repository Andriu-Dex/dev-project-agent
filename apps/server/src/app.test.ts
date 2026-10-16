import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('service health', () => {
  it('returns a timestamped successful database check', async () => {
    const app = buildApp({ checkDatabase: async () => {} });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', database: 'available' });
    expect(Number.isNaN(Date.parse(response.json().checkedAt))).toBe(false);
  });

  it('reports database failure without exposing credentials or provider errors', async () => {
    const app = buildApp({ checkDatabase: async () => { throw new Error('postgresql://secret-user:secret-password@private-host/db'); } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'degraded', database: 'unavailable' });
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain('private-host');
  });

  it('does not expose an unfinished project API', async () => {
    const app = buildApp({ checkDatabase: async () => {} });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/projects/current' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});
