import type { TrackingPolicyResponse } from '@dev-project-agent/contracts';
import type { AuthDatabase, AuthUser } from '../auth/repository.js';
import type { TrelloDatabase } from '../../integrations/trello/service.js';
import type { TrackingPolicy } from './rules.js';

export class TrackingPolicyError extends Error {
  constructor(readonly code: 'POLICY_CONFLICT' | 'POLICY_NOT_CONFIGURED' | 'FORBIDDEN' | 'INVALID_POLICY') { super('Tracking policy operation failed.'); }
}
interface PolicyRow {
  version: number; due_soon_hours: number; stale_after_minutes: number; confirmed: boolean;
  changed_at: Date; changed_by: string | null; display_name: string | null;
}
export async function readTrackingPolicy(database: AuthDatabase, projectId: string): Promise<TrackingPolicyResponse | null> {
  const result = await database.query<PolicyRow>(
    'SELECT p.version, p.due_soon_hours, p.stale_after_minutes, p.confirmed, p.changed_at, p.changed_by, u.display_name FROM tracking_policy_versions p LEFT JOIN users u ON u.id = p.changed_by WHERE p.project_id = $1 ORDER BY p.version DESC LIMIT 1', [projectId],
  );
  const row = result.rows[0];
  return row ? { version: row.version, dueSoonHours: row.due_soon_hours, staleAfterMinutes: row.stale_after_minutes, confirmed: row.confirmed,
    changedAt: row.changed_at.toISOString(), changedBy: row.changed_by ? { id: row.changed_by, displayName: row.display_name! } : null } : null;
}
export function evaluationPolicy(configuration: TrackingPolicyResponse): TrackingPolicy {
  return { version: `tracking-v1/config-v${configuration.version}`, dueSoonHours: configuration.dueSoonHours,
    staleAfterMinutes: configuration.staleAfterMinutes, thresholdsConfirmed: configuration.confirmed, priorityLabels: {}, blockedLabels: [] };
}
export async function changeTrackingPolicy(database: TrelloDatabase, projectId: string, actor: AuthUser,
  values: { expectedVersion: number; dueSoonHours: number; staleAfterMinutes: number }): Promise<TrackingPolicyResponse> {
  if (!Number.isInteger(values.expectedVersion) || values.expectedVersion < 1 || !Number.isInteger(values.dueSoonHours) || values.dueSoonHours < 1 || values.dueSoonHours > 720 ||
    !Number.isInteger(values.staleAfterMinutes) || values.staleAfterMinutes < 1 || values.staleAfterMinutes > 10080) throw new TrackingPolicyError('INVALID_POLICY');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tracking-policy:${projectId}`]);
    const permission = await client.query('SELECT u.id FROM users u JOIN project_memberships m ON m.user_id = u.id WHERE u.id = $1 AND u.active = true AND u.auth_version = $2 AND m.project_id = $3 AND m.active = true AND m.role = $4', [actor.id, actor.auth_version, projectId, 'manager']);
    if (!permission.rows.length) throw new TrackingPolicyError('FORBIDDEN');
    const previous = await readTrackingPolicy(client, projectId);
    if (!previous) throw new TrackingPolicyError('POLICY_NOT_CONFIGURED');
    if (previous.version !== values.expectedVersion) throw new TrackingPolicyError('POLICY_CONFLICT');
    const version = previous.version + 1;
    await client.query('INSERT INTO tracking_policy_versions (project_id, version, due_soon_hours, stale_after_minutes, confirmed, changed_by) VALUES ($1,$2,$3,$4,true,$5)',
      [projectId, version, values.dueSoonHours, values.staleAfterMinutes, actor.id]);
    await client.query('INSERT INTO audit_events (project_id, actor_type, actor_id, action, resource_type, resource_id, outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [projectId, 'user', actor.id, 'tracking.policy.update', 'tracking_policy_version', `${projectId}:v${version}`, 'succeeded']);
    const configuration = await readTrackingPolicy(client, projectId);
    await client.query('COMMIT');
    return configuration!;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
