import { AuthRepository, type AuthDatabase } from './repository.js';

export async function createLocalUser(database: AuthDatabase, input: {
  login: string; displayName: string; passwordHash: string; role: 'manager' | 'viewer';
}) {
  const projectId = await new AuthRepository(database).defaultProjectId();
  if (!projectId) throw new Error('Run database migrations before creating users.');
  const result = await database.query<{ id: string }>(
    'INSERT INTO users (login, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [input.login, input.displayName, input.passwordHash],
  );
  const userId = result.rows[0]!.id;
  await database.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)', [projectId, userId, input.role]);
  await new AuthRepository(database).audit(projectId, null, 'auth.user.create', 'succeeded', userId);
  return userId;
}

export async function resetLocalPassword(database: AuthDatabase, login: string, passwordHash: string) {
  const result = await database.query<{ id: string }>(
    'UPDATE users SET password_hash = $1, auth_version = auth_version + 1 WHERE login = $2 RETURNING id',
    [passwordHash, login],
  );
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error('Local account was not found.');
  await database.query("UPDATE sessions SET revoked_at = now(), payload = '{}'::jsonb, expires_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  const memberships = await database.query<{ project_id: string }>('SELECT project_id FROM project_memberships WHERE user_id = $1', [userId]);
  const repository = new AuthRepository(database);
  for (const membership of memberships.rows) {
    await repository.audit(membership.project_id, null, 'auth.password.reset', 'succeeded', userId);
  }
}
