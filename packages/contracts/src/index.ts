export const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'database', 'checkedAt'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    database: { type: 'string', enum: ['available', 'unavailable'] },
    checkedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'available' | 'unavailable';
  checkedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
}

export const agentRoles = ['executor', 'reviewer', 'approver'] as const;
export type AgentRole = (typeof agentRoles)[number];

export type ProjectRole = 'manager' | 'viewer';

export interface ProjectAccess {
  id: string;
  name: string;
  timeZone: string;
  role: ProjectRole;
  canManageProject: boolean;
}

export type SessionResponse =
  | { authenticated: false; csrfToken: string }
  | {
    authenticated: true;
    csrfToken: string;
    user: { id: string; login: string; displayName: string };
    project: ProjectAccess | null;
  };
