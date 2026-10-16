import { describe, expect, it } from 'vitest';
import { authConfigFromEnvironment } from './config.js';

const base = { SESSION_SECRET: 'a'.repeat(96), APP_ORIGINS: 'https://example.com' };
describe('Authentication configuration', () => {
  it('requires a secret and explicit origins', () => {
    expect(() => authConfigFromEnvironment({ ...base, SESSION_SECRET: '' })).toThrow();
    expect(() => authConfigFromEnvironment({ ...base, APP_ORIGINS: '' })).toThrow();
  });
  it('rejects remote plain HTTP, paths, and credentials', () => {
    for (const origin of ['http://example.com', 'https://example.com/path', 'https://user:pass@example.com']) {
      expect(() => authConfigFromEnvironment({ ...base, APP_ORIGINS: origin, ALLOW_INSECURE_LOCAL_HTTP: 'true' })).toThrow();
    }
  });
  it('uses secure cookies unless loopback HTTP is explicitly enabled', () => {
    expect(authConfigFromEnvironment(base).secureCookies).toBe(true);
    expect(() => authConfigFromEnvironment({ ...base, APP_ORIGINS: 'http://127.0.0.1:5174' })).toThrow();
    expect(authConfigFromEnvironment({ ...base, APP_ORIGINS: 'http://127.0.0.1:5174', ALLOW_INSECURE_LOCAL_HTTP: 'true' }).secureCookies).toBe(false);
  });
});
