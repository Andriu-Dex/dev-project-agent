import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import type {AuthRepository,AuthUser} from '../../modules/auth/repository.js';
import {OllamaService,OllamaError} from './service.js';

export function registerOllamaRoutes(
  app:FastifyInstance,
  service:OllamaService,
  requireUser:(request:FastifyRequest,reply:FastifyReply)=>Promise<AuthUser|null>,
  repository:AuthRepository
) {
  const params={
    type:'object',
    required:['projectId'],
    properties:{projectId:{type:'string',format:'uuid'}},
  } as const;

  async function access(
    request:FastifyRequest<{Params:{projectId:string}}>,
    reply:FastifyReply,
    manager=false
  ) {
    const actor=await requireUser(request,reply);
    if(!actor)return null;
    const project=await repository.projectForUser(actor.id,request.params.projectId);
    if(!project){
      reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el proyecto.'});
      return null;
    }
    if(manager&&!project.canManageProject){
      reply.code(403).send({code:'FORBIDDEN',message:'Esta operación requiere permisos de gestor.'});
      return null;
    }
    return {actor,project};
  }

  function failure(error:unknown,reply:FastifyReply) {
    const code=error instanceof OllamaError?error.code:'OLLAMA_UNAVAILABLE';
    const status=code==='CONFLICT'?409:code==='FORBIDDEN'?403:code==='INVALID_MODEL'?400:503;
    const messages:Record<string,string>={
      OLLAMA_UNAVAILABLE:'No se pudo conectar con el servicio local de Ollama. Asegúrate de que Ollama esté en ejecución.',
      MODEL_NOT_AVAILABLE:'El modelo seleccionado no está instalado en Ollama local.',
      INVALID_MODEL_OUTPUT:'La respuesta del modelo local no cumple con el formato estructurado JSON.',
      INFERENCE_TIMEOUT:'La inferencia excedió el tiempo máximo de espera.',
      CONFLICT:'Ya hay una evaluación activa o la solicitud cambió. Actualiza el panel.',
      FORBIDDEN:'Esta operación requiere permisos de gestor.',
      INVALID_MODEL:'El nombre del modelo no cumple el formato permitido.',
    };
    return reply.code(status).send({code,message:messages[code]??'No se pudo completar la operación con Ollama.'});
  }

  app.get<{Params:{projectId:string}}>('/projects/:projectId/ollama',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);
    if(!context)return reply;
    return service.overview(context.project.id);
  });

  app.get<{Params:{projectId:string}}>('/projects/:projectId/ollama/health',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);
    if(!context)return reply;
    return service.healthCheck();
  });

  app.post<{Params:{projectId:string};Body:{model:string;requestKey:string}}>(
    '/projects/:projectId/ollama/evaluations',
    {
      schema:{
        params,
        body:{
          type:'object',
          additionalProperties:false,
          required:['model','requestKey'],
          properties:{
            model:{type:'string',minLength:1,maxLength:120,pattern:'^[a-zA-Z0-9_.:/-]+$'},
            requestKey:{type:'string',format:'uuid'},
          },
        },
      },
      onRequest:[app.csrfProtection],
      config:{rateLimit:{max:5,timeWindow:'1 minute'}},
    },
    async(request,reply)=>{
      const context=await access(request,reply,true);
      if(!context)return reply;
      try {
        const evaluation=await service.evaluate(
          context.project.id,
          context.actor,
          request.body.model,
          request.body.requestKey
        );
        return reply.code(202).send(evaluation);
      } catch(error) {
        return failure(error,reply);
      }
    }
  );
}
