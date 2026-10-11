import type { AuthDatabase, AuthUser } from '../auth/repository.js';
export class SupervisionError extends Error {
  constructor(readonly code: 'FORBIDDEN'|'CONFLICT'|'SOURCE_CHANGED'|'NOT_FOUND'|'NO_DATA'|'POLICY_NOT_CONFIGURED'|'LEASE_LOST'|'INVALID_REQUEST') { super('Supervision operation failed.'); }
}
export async function assertManager(database:AuthDatabase,projectId:string,actor:Pick<AuthUser,'id'|'auth_version'>) {
  const permission=await database.query('SELECT u.id FROM users u JOIN project_memberships m ON m.user_id=u.id WHERE u.id=$1 AND u.active=true AND u.auth_version=$2 AND m.project_id=$3 AND m.active=true AND m.role=$4',[actor.id,actor.auth_version,projectId,'manager']);
  if (!permission.rows.length) throw new SupervisionError('FORBIDDEN');
}
