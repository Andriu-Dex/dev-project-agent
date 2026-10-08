import Fastify, { LogController } from 'fastify';
import { healthResponseSchema, type HealthResponse } from '@dev-project-agent/contracts';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  logger?: boolean;
}

export function buildApp({ checkDatabase, logger = false }: AppOptions) {
  const app = Fastify({
    logger: logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] } : false,
    logController: new LogController({ disableRequestLogging: true }),
    requestTimeout: 10_000,
    bodyLimit: 64 * 1024,
  });

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
  app.setErrorHandler((_error, request, reply) => {
    reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'No se pudo completar la solicitud.', requestId: request.id });
  });
  return app;
}
