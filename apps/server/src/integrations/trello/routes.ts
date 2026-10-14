import type { TrackingPolicyResponse } from '@dev-project-agent/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthRepository, AuthUser } from '../../modules/auth/repository.js';
import { readBoard, type TrelloCredentials } from './client.js';
import { overview, synchronize, type TrelloDatabase } from './service.js';
import { TrelloError } from './normalize.js';
import { evaluateTracking } from '../../modules/tracking/rules.js';
import { readTrackingPolicy, changeTrackingPolicy, evaluationPolicy, TrackingPolicyError } from '../../modules/tracking/policy.js';

export interface TrelloOptions { database: TrelloDatabase; credentials: TrelloCredentials | null; fetcher?: typeof fetch }
export function registerTrelloRoutes(app: FastifyInstance, options: TrelloOptions,
  requireUser: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>, repository: AuthRepository) {
  const schema = { params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string', format: 'uuid' } } } } as const;
  async function access(request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply, manager: boolean, action = 'trello.sync') {
    const user = await requireUser(request, reply);
    if (!user) return null;
    const project = await repository.projectForUser(user.id, request.params.projectId);
    if (!project) { reply.code(404).send({ code: 'NOT_FOUND', message: 'No se encontró el proyecto.' }); return null; }
    if (manager && !project.canManageProject) {
      await options.database.query('INSERT INTO audit_events (project_id, actor_type, actor_id, action, resource_type, resource_id, outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [project.id, 'user', user.id, action, action === 'trello.sync' ? 'trello_connection' : 'tracking_policy_version', project.id, 'denied']);
      reply.code(403).send({ code: 'FORBIDDEN', message: 'Esta operación requiere permisos de gestor.' });
      return null;
    }
    return { project, user };
  }
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/trello', { schema }, async (request, reply) => {
    const context = await access(request, reply, false);
    if (!context) return reply;
    const result = await overview(options.database, context.project.id, Boolean(options.credentials));
    return result ?? reply.code(404).send({ code: 'NOT_CONFIGURED', message: 'Este proyecto no tiene un tablero configurado.' });
  });
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/tracking', { schema }, async (request, reply) => {
    const context = await access(request, reply, false);
    if (!context) return reply;
    const source = await overview(options.database, context.project.id, Boolean(options.credentials));
    if (!source) return reply.code(404).send({ code: 'NOT_CONFIGURED', message: 'Este proyecto no tiene un tablero configurado.' });
    const configuration = await readTrackingPolicy(options.database, context.project.id);
    if (!configuration) return reply.code(503).send({ code: 'POLICY_NOT_CONFIGURED', message: 'La configuración del seguimiento no está disponible.' });
    return evaluateTracking(source, new Date(), evaluationPolicy(configuration));
  });
  app.get<{ Params: { projectId: string } }>('/projects/:projectId/tracking-policy', { schema }, async (request, reply) => {
    const context = await access(request, reply, false);
    if (!context) return reply;
    return await readTrackingPolicy(options.database, context.project.id) ?? reply.code(404).send({ code: 'POLICY_NOT_CONFIGURED', message: 'Este proyecto no tiene configuración de seguimiento.' });
  });
  app.put<{ Params: { projectId: string }; Body: { expectedVersion: number; dueSoonHours: number; staleAfterMinutes: number } & Pick<TrackingPolicyResponse, 'priorityLabels' | 'blockedLabels' | 'stateLabels'> }>('/projects/:projectId/tracking-policy', {
    schema: { ...schema, body: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'dueSoonHours', 'staleAfterMinutes'], properties: {
      priorityLabels: { type: 'object', maxProperties: 50, additionalProperties: { type: 'string', enum: ['high','medium','low'] } }, blockedLabels: { type: 'array', maxItems: 50, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 } }, stateLabels: { type: 'object', maxProperties: 50, additionalProperties: { type: 'string', enum: ['pending','in_progress','completed'] } },
      expectedVersion: { type: 'integer', minimum: 1 }, dueSoonHours: { type: 'integer', minimum: 1, maximum: 720 }, staleAfterMinutes: { type: 'integer', minimum: 1, maximum: 10080 },
    } } }, onRequest: [app.csrfProtection],
  }, async (request, reply) => {
    const context = await access(request, reply, true, 'tracking.policy.update');
    if (!context) return reply;
    try { return await changeTrackingPolicy(options.database, context.project.id, context.user, request.body); }
    catch (error) {
      if (!(error instanceof TrackingPolicyError)) throw error;
      const status = error.code === 'POLICY_CONFLICT' ? 409 : error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_POLICY' ? 400 : 503;
      return reply.code(status).send({ code: error.code, message: error.code === 'POLICY_CONFLICT' ? 'La configuración cambió en otra sesión. Recarga los valores antes de guardar.' : 'No se pudo guardar la configuración. Revisa tus permisos y los valores.', requestId: request.id });
    }
  });
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/trello/sync', {
    schema, onRequest: [app.csrfProtection], config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const context = await access(request, reply, true);
    if (!context) return reply;
    try {
      return await synchronize(options.database, context.project.id, context.user.id, 'api', async boardId => {
        if (!options.credentials) throw new TrelloError('CREDENTIALS_REQUIRED');
        return { board: await readBoard(boardId, options.credentials, options.fetcher), observedAt: new Date() };
      });
    } catch (error) {
      const code = error instanceof TrelloError ? error.code : 'STORAGE_UNAVAILABLE';
      return reply.code(code === 'SYNC_BUSY' ? 409 : 503).send({ code, message: code === 'CREDENTIALS_REQUIRED' ? 'El gestor debe configurar la conexión con Trello.' : code === 'SYNC_BUSY' ? 'Ya hay una sincronización en curso.' : 'No se pudo actualizar Trello. Se conserva la última lectura válida.', requestId: request.id });
    }
  });
}
