import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import csrf from '@fastify/csrf-protection';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SessionResponse } from '@dev-project-agent/contracts';
import type { AuthConfig } from './config.js';
import { AuthRepository, type AuthDatabase, type AuthUser } from './repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { PostgresSessionStore, SESSION_IDLE_MS } from './session-store.js';
import { registerTrelloRoutes, type TrelloOptions } from '../../integrations/trello/routes.js';
import { registerSupervisionRoutes } from '../supervision/routes.js';
import type { SupervisionOptions } from '../supervision/worker.js';
import type { ChatGPTService } from '../../providers/chatgpt/service.js';
import { registerChatGPTRoutes } from '../../providers/chatgpt/routes.js';
import type { ProposalService } from '../proposals/service.js';
import { registerProposalRoutes } from '../proposals/routes.js';

export interface AuthOptions extends AuthConfig { database: AuthDatabase; trello?: TrelloOptions; supervision?:SupervisionOptions; chatgpt?:ChatGPTService; proposals?:ProposalService }

export async function registerAuth(app: FastifyInstance, options: AuthOptions) {
  const repository = new AuthRepository(options.database);
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  await app.register(cookie);
  await app.register(session, {
    secret: options.sessionSecret,
    cookieName: 'dpa_session',
    store: new PostgresSessionStore(options.database),
    saveUninitialized: false,
    rolling: true,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: options.secureCookies, maxAge: SESSION_IDLE_MS },
  });
  await app.register(csrf, {
    sessionPlugin: '@fastify/session',
    getToken: request => typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : undefined,
    logLevel: 'debug',
  });
  await app.register(rateLimit, {
    global: false,
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !options.allowedOrigins.includes(request.headers.origin ?? '')) {
      return reply.code(403).send({ code: 'INVALID_ORIGIN', message: 'El origen de la solicitud no está permitido.', requestId: request.id });
    }
  });

  async function currentUser(request: FastifyRequest): Promise<AuthUser | null> {
    if (!request.session.userId) return null;
    const user = await repository.getUser(request.session.userId);
    if (!user?.active || user.auth_version !== request.session.authVersion) {
      options.chatgpt?.connections.disconnectSession(request.session.sessionId);
      await request.session.regenerate();
      return null;
    }
    return user;
  }

  async function sessionView(request: FastifyRequest, reply: FastifyReply): Promise<SessionResponse> {
    const user = await currentUser(request);
    const csrfToken = reply.generateCsrf();
    if (!user) return { authenticated: false, csrfToken };
    const project = await repository.projectForUser(user.id);
    return {
      authenticated: true,
      csrfToken,
      user: { id: user.id, login: user.login, displayName: user.display_name },
      project,
    };
  }

  async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | null> {
    const user = await currentUser(request);
    if (!user) {
      reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Inicia sesión para continuar.', requestId: request.id });
      return null;
    }
    return user;
  }

  if (options.trello) registerTrelloRoutes(app, options.trello, requireUser, repository);
  if (options.supervision) registerSupervisionRoutes(app, options.supervision, requireUser, repository);
  if (options.chatgpt) registerChatGPTRoutes(app, options.chatgpt, requireUser, repository);
  if (options.proposals) registerProposalRoutes(app, options.proposals, requireUser, repository);

  const loginSchema = {
    body: {
      type: 'object', additionalProperties: false, required: ['login', 'password'],
      properties: { login: { type: 'string', minLength: 3, maxLength: 64, pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' }, password: { type: 'string', minLength: 1, maxLength: 128 } },
    },
  } as const;

  app.get('/session', sessionView);
  app.post<{ Body: { login: string; password: string } }>('/session/login', {
    schema: loginSchema,
    onRequest: [app.csrfProtection],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await repository.findUser(request.body.login.toLowerCase());
    const valid = await verifyPassword(user?.password_hash ?? dummyHash, request.body.password);
    const projectId = user ? (await repository.projectForUser(user.id))?.id : await repository.defaultProjectId();
    if (!user?.active || !valid || !projectId) {
      const auditProjectId = projectId ?? await repository.defaultProjectId();
      if (auditProjectId) await repository.audit(auditProjectId, null, 'auth.login', 'denied', 'session');
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos.', requestId: request.id });
    }
    await request.session.regenerate();
    request.session.userId = user.id;
    request.session.authVersion = user.auth_version;
    request.session.authenticatedAt = Date.now();
    await repository.audit(projectId, user.id, 'auth.login', 'succeeded', 'session');
    const view = await sessionView(request, reply);
    await request.session.save();
    return view;
  });

  app.post('/session/logout', { onRequest: [app.csrfProtection] }, async (request, reply) => {
    options.chatgpt?.connections.disconnectSession(request.session.sessionId);
    const user = await currentUser(request);
    if (user) {
      const project = await repository.projectForUser(user.id);
      if (project) await repository.audit(project.id, user.id, 'auth.logout', 'succeeded', 'session');
    }
    await request.session.destroy();
    reply.clearCookie('dpa_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: options.secureCookies });
    return reply.code(204).send();
  });

  app.get('/projects/current', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const project = await repository.projectForUser(user.id);
    if (!project) return reply.code(403).send({ code: 'NO_MEMBERSHIP', message: 'No tienes acceso a este proyecto.', requestId: request.id });
    return project;
  });

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/members', {
    schema: { params: { type: 'object', required: ['projectId'], properties: { projectId: { type: 'string', format: 'uuid' } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const project = await repository.projectForUser(user.id, request.params.projectId);
    if (!project) return reply.code(404).send({ code: 'NOT_FOUND', message: 'No se encontró el recurso solicitado.', requestId: request.id });
    if (project.role !== 'manager') {
      await repository.audit(project.id, user.id, 'auth.members.read', 'denied', project.id);
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'Esta operación requiere permisos de gestor.', requestId: request.id });
    }
    return { members: await repository.members(project.id) };
  });
}
