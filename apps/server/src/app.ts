import Fastify, { LogController } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@dev-project-agent/contracts';
import { registerAuth, type AuthOptions } from './modules/auth/routes.js';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  logger?: boolean;
  auth?: AuthOptions;
}

export function buildApp({ checkDatabase, logger = false, auth }: AppOptions) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    logger: logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] } : false,
    logController: new LogController({ disableRequestLogging: true }),
    requestTimeout: 10_000,
    bodyLimit: 64 * 1024,
  });

  if (auth) {
    app.register(async scope => { await registerAuth(scope, auth); }, { prefix: '/api/v1' });
  }

  app.get('/api/v1/health', {
    schema: { response: { 200: healthResponseSchema, 503: healthResponseSchema } },
  }, async (_request, reply): Promise<HealthResponse> => {
    const checkedAt = new Date().toISOString();
    try {
      await checkDatabase();
      return { status: 'ok', database: 'available', checkedAt };
    } catch {
      reply.code(503);
      return { status: 'degraded', database: 'unavailable', checkedAt };
    }
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ code: 'NOT_FOUND', message: 'No se encontró el recurso solicitado.', requestId: request.id });
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : (reply.statusCode >= 400 ? reply.statusCode : 500);
    const errors: Record<number, { code: string; message: string }> = {
      400: { code: 'INVALID_REQUEST', message: 'Revisa los datos de la solicitud.' },
      403: { code: 'INVALID_CSRF', message: 'La solicitud no es válida. Actualiza la página e inténtalo de nuevo.' },
      413: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud excede el tamaño permitido.' },
      415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'El formato de la solicitud no está permitido.' },
      429: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera un minuto antes de volver a intentar.' },
      503: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible. Inténtalo más tarde.' },
    };
    const safeStatus = errors[statusCode] ? statusCode : 500;
    reply.code(safeStatus).send({ ...(errors[safeStatus] ?? { code: 'INTERNAL_ERROR', message: 'No se pudo completar la solicitud.' }), requestId: request.id });
  });
  return app;
}
