import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import type {AuthRepository,AuthUser} from '../../modules/auth/repository.js';
import {ChatGPTService,providerCode} from './service.js';
import type {ConnectionBinding} from './connection.js';
import type {ReasoningEffort} from '@dev-project-agent/contracts';

export function registerChatGPTRoutes(app:FastifyInstance,service:ChatGPTService,requireUser:(request:FastifyRequest,reply:FastifyReply)=>Promise<AuthUser|null>,repository:AuthRepository) {
  const params={type:'object',required:['projectId'],properties:{projectId:{type:'string',format:'uuid'}}} as const;
  async function access(request:FastifyRequest<{Params:{projectId:string}}>,reply:FastifyReply,manager=false) {
    const actor=await requireUser(request,reply);if(!actor)return null;
    const project=await repository.projectForUser(actor.id,request.params.projectId);
    if(!project){reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el proyecto.'});return null;}
    if(manager&&!project.canManageProject){reply.code(403).send({code:'FORBIDDEN',message:'Esta operación requiere permisos de gestor.'});return null;}
    const binding:ConnectionBinding={projectId:project.id,userId:actor.id,authVersion:actor.auth_version,sessionId:request.session.sessionId};
    return {actor,project,binding};
  }
  function failure(error:unknown,reply:FastifyReply) {
    const code=providerCode(error);
    if(code==='INPUT_TOO_LARGE'||code==='INVALID_REQUEST')return reply.code(400).send({code,message:code==='INPUT_TOO_LARGE'?'La evidencia supera el límite de envío. Reduce el alcance de la solicitud.':'La solicitud al proveedor no cumple el formato permitido.'});
    const status=code==='UNSUPPORTED_EFFORT'?400:code==='FORBIDDEN'?403:code==='CONFLICT'?409:['CONNECTION_REQUIRED','MODEL_NOT_AVAILABLE','NO_PENDING_AUTHORIZATION','AUTHORIZATION_EXPIRED'].includes(code)?409:code==='USAGE_LIMIT'?429:503;
    return reply.code(status).send({code,message:code==='UNSUPPORTED_EFFORT'?'El modelo no admite ese nivel de razonamiento.':code==='USAGE_LIMIT'?'ChatGPT alcanzó un límite de uso. Espera antes de volver a evaluar.':code==='CONFLICT'?'Ya hay una evaluación activa o la solicitud cambió. Actualiza el panel.':status===409?'Conecta ChatGPT y selecciona un modelo disponible antes de continuar.':'No se pudo completar la operación con ChatGPT. Puedes volver a intentar.'});
  }
  app.get<{Params:{projectId:string}}>('/projects/:projectId/chatgpt',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);if(!context)return reply;
    return service.overview(context.binding,context.project.canManageProject);
  });
  app.post<{Params:{projectId:string}}>('/projects/:projectId/chatgpt/authorization',{
    schema:{params},onRequest:[app.csrfProtection],config:{rateLimit:{max:5,timeWindow:'1 minute'}},
  },async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return reply;
    try{return await service.authorize(context.binding);}catch(error){return failure(error,reply);}
  });
  app.get<{Params:{projectId:string}}>('/projects/:projectId/chatgpt/callback',{schema:{params}},async(request,reply)=>{
    reply.header('Content-Security-Policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'");reply.header('Referrer-Policy','no-referrer');
    const context=await access(request,reply,true);if(!context)return reply;
    try{
      await service.callback(context.binding,new URL(request.url,service.options.callbackOrigin));
      return reply.type('text/html; charset=utf-8').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>ChatGPT conectado</title><h1>ChatGPT conectado</h1><p>Identidad, permisos y modelos verificados. Puedes cerrar esta pestaña y volver al panel. La evaluación se inicia desde el panel y utiliza solo datos sintéticos.</p></html>');
    }catch(error){
      return reply.code(providerCode(error)==='INVALID_STATE'?400:503).type('text/html; charset=utf-8').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>Conexión no completada</title><h1>No se pudo conectar ChatGPT</h1><p>Vuelve al panel para revisar el estado e iniciar un nuevo intento. No compartas la dirección de esta página.</p></html>');
    }
  });
  app.post<{Params:{projectId:string}}>('/projects/:projectId/chatgpt/disconnect',{schema:{params},onRequest:[app.csrfProtection]},async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return reply;
    try{const result=await service.disconnect(context.binding);reply.header('X-Remote-Revocation-Confirmed',String(result.remoteRevocationConfirmed));return reply.code(204).send();}catch(error){return failure(error,reply);}
  });
  app.post<{Params:{projectId:string};Body:{model:string;requestKey:string;reasoningEffort?:ReasoningEffort}}>('/projects/:projectId/chatgpt/evaluations',{
    schema:{params,body:{type:'object',additionalProperties:false,required:['model','requestKey'],properties:{model:{type:'string',minLength:1,maxLength:100,pattern:'^[a-zA-Z0-9_.:-]+$'},requestKey:{type:'string',format:'uuid'},reasoningEffort:{type:'string',enum:['low','medium','high','xhigh','max']}}}},
    onRequest:[app.csrfProtection],config:{rateLimit:{max:5,timeWindow:'1 minute'}},
  },async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return reply;
    try{return reply.code(202).send(await service.evaluate(context.binding,context.actor,request.body.model,request.body.requestKey,request.body.reasoningEffort??null));}
    catch(error){return failure(error,reply);}
  });
}
