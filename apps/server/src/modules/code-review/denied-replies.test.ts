import Fastify from 'fastify';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {describe, expect, it, vi} from 'vitest';
import {AuthRepository, type AuthUser} from '../auth/repository.js';
import {registerPublicationRoutes} from './publication-routes.js';
import {PublicationService} from './publication.js';

describe('Denied publication replies', () => {
  it.each([401, 403, 404])('preserves the JSON denial with an asynchronous response hook (%i)', async status => {
    const app = Fastify();
    let sendCalls = 0;
    app.decorate('csrfProtection', async () => {});
    app.addHook('onSend', (_request, _reply, payload, done) => {
      sendCalls++;
      setImmediate(() => done(null, payload));
    });
    const repository = new AuthRepository({query: vi.fn()} as never);
    vi.spyOn(repository, 'projectForUser').mockResolvedValue(status === 404 ? null : {
      id: '11111111-1111-4111-8111-111111111111', name: 'Fixture',
      timeZone: 'America/Guayaquil', role: 'viewer', canManageProject: false,
    });
    const requestPublication = vi.spyOn(PublicationService.prototype, 'request');
    const service = Object.create(PublicationService.prototype) as PublicationService;
    registerPublicationRoutes(app, service, async (_request, reply) => {
      if (status === 401) {
        reply.code(401).send({code: 'UNAUTHENTICATED', message: 'Inicia sesión.'});
        return null;
      }
      return {id: '22222222-2222-4222-8222-222222222222'} as AuthUser;
    }, repository);
    try {
      const response = await app.inject({method: 'POST', url: '/projects/11111111-1111-4111-8111-111111111111/code-review/proposals/33333333-3333-4333-8333-333333333333/versions/1/publish', payload: {
        contentHash: 'a'.repeat(64), requestKey: '44444444-4444-4444-8444-444444444444', confirmed: false,
      }});
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({code: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'NOT_FOUND'});
      await nextTurn();
      expect(sendCalls).toBe(1);
      expect(requestPublication).not.toHaveBeenCalled();
    } finally {
      await app.close();
      vi.restoreAllMocks();
    }
  });
});
