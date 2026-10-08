import { createHash } from 'node:crypto';
import type { Session } from 'fastify';
import type { SessionStore } from '@fastify/session';
import type { AuthDatabase } from './repository.js';

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

declare module 'fastify' {
  interface Session {
    userId?: string;
    authVersion?: number;
    authenticatedAt?: number;
  }
}

const keyFor = (id: string) => createHash('sha256').update(id).digest('hex');
const storageError = () => Object.assign(new Error('Session storage is unavailable.'), { statusCode: 503 });

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly database: AuthDatabase) {}

  set(id: string, session: Session, callback: (error?: Error) => void): void {
    const payload = JSON.stringify(session);
    const absoluteExpiry = session.authenticatedAt === undefined ? Infinity : session.authenticatedAt + SESSION_ABSOLUTE_MS;
    const expiresAt = new Date(Math.min(Date.now() + SESSION_IDLE_MS, absoluteExpiry));
    void this.database.query(
      'INSERT INTO sessions (id, user_id, payload, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at WHERE sessions.revoked_at IS NULL',
      [keyFor(id), session.userId ?? null, payload, expiresAt],
    ).then(() => callback(), () => callback(storageError()));
  }

  get(id: string, callback: (error: Error | null, session?: Session | null) => void): void {
    void this.database.query<{ payload: Session }>(
      'SELECT payload FROM sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()',
      [keyFor(id)],
    ).then(result => {
      const session = result.rows[0]?.payload;
      if (session?.authenticatedAt !== undefined && session.authenticatedAt + SESSION_ABSOLUTE_MS <= Date.now()) {
        callback(null, null);
      } else {
        callback(null, session ?? null);
      }
    }, () => callback(storageError()));
  }

  destroy(id: string, callback: (error?: Error) => void): void {
    // A tombstone prevents an in-flight request from recreating a revoked session.
    void this.database.query(
      "INSERT INTO sessions (id, payload, expires_at, revoked_at) VALUES ($1, '{}'::jsonb, now(), now()) ON CONFLICT (id) DO UPDATE SET payload = '{}'::jsonb, user_id = NULL, expires_at = now(), revoked_at = now()",
      [keyFor(id)],
    ).then(() => callback(), () => callback(storageError()));
  }
}
