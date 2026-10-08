import type pg from 'pg';
import type { ProjectAccess, ProjectRole } from '@dev-project-agent/contracts';

export type AuthDatabase = Pick<pg.Pool, 'query'>;
export interface AuthUser {
  id: string;
  login: string;
  display_name: string;
  password_hash: string;
  active: boolean;
  auth_version: number;
}

export class AuthRepository {
  constructor(readonly database: AuthDatabase) {}

  async findUser(login: string): Promise<AuthUser | null> {
    const result = await this.database.query<AuthUser>('SELECT id, login, display_name, password_hash, active, auth_version FROM users WHERE login = $1', [login]);
    return result.rows[0] ?? null;
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    const result = await this.database.query<AuthUser>('SELECT id, login, display_name, password_hash, active, auth_version FROM users WHERE id = $1', [userId]);
    return result.rows[0] ?? null;
  }

  async projectForUser(userId: string, projectId?: string): Promise<ProjectAccess | null> {
    const result = await this.database.query<{ id: string; name: string; time_zone: string; role: ProjectRole }>(
      'SELECT p.id, p.name, p.time_zone, m.role FROM projects p JOIN project_memberships m ON m.project_id = p.id WHERE m.user_id = $1 AND m.active = true AND ($2::uuid IS NULL OR p.id = $2) ORDER BY p.created_at, p.id LIMIT 1',
      [userId, projectId ?? null],
    );
    const row = result.rows[0];
    return row ? { id: row.id, name: row.name, timeZone: row.time_zone, role: row.role, canManageProject: row.role === 'manager' } : null;
  }

  async defaultProjectId(): Promise<string | null> {
    const result = await this.database.query<{ id: string }>('SELECT id FROM projects ORDER BY created_at, id LIMIT 1');
    return result.rows[0]?.id ?? null;
  }

  async members(projectId: string) {
    const result = await this.database.query<{ id: string; display_name: string; role: ProjectRole }>(
      'SELECT u.id, u.display_name, m.role FROM project_memberships m JOIN users u ON u.id = m.user_id WHERE m.project_id = $1 AND m.active = true AND u.active = true ORDER BY u.display_name, u.id', [projectId],
    );
    return result.rows.map(row => ({ id: row.id, displayName: row.display_name, role: row.role }));
  }

  async audit(projectId: string, actorId: string | null, action: string, outcome: string, resourceId: string) {
    await this.database.query(
      'INSERT INTO audit_events (project_id, actor_type, actor_id, action, resource_type, resource_id, outcome) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [projectId, actorId ? 'user' : 'system', actorId, action, 'authentication', resourceId, outcome],
    );
  }
}
