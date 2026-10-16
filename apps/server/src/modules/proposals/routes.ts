import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import type {AuthRepository,AuthUser} from '../auth/repository.js';
import type {ConnectionBinding} from '../../providers/chatgpt/connection.js';
import type {ReasoningEffort} from '@dev-project-agent/contracts';
import {ProposalService,type ProposalRequest} from './service.js';
import {ProposalError} from './contracts.js';
import {providerCode} from '../../providers/chatgpt/service.js';

export function registerProposalRoutes(app:FastifyInstance,service:ProposalService,requireUser:(request:FastifyRequest,reply:FastifyReply)=>Promise<AuthUser|null>,repository:AuthRepository) {
  const uuid={type:'string',format:'uuid'},effort={type:'string',enum:['low','medium','high','xhigh','max']};
  const model={type:'string',minLength:1,maxLength:100,pattern:'^[a-zA-Z0-9_./:-]+$'};
  const params={type:'object',required:['projectId'],properties:{projectId:uuid}};
  const versionParams={type:'object',required:['projectId','proposalId','version'],properties:{projectId:uuid,proposalId:uuid,version:{type:'integer',minimum:1,maximum:10000}}};
  type VersionParams={projectId:string;proposalId:string;version:number};
  async function access(request:FastifyRequest<{Params:{projectId:string}}>,reply:FastifyReply,manager=false) {
    const actor=await requireUser(request,reply);if(!actor)return null;
    const project=await repository.projectForUser(actor.id,request.params.projectId);
    if(!project){reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el proyecto.'});return null;}
    if(manager&&!project.canManageProject){reply.code(403).send({code:'FORBIDDEN',message:'Esta operación requiere permisos de gestor.'});return null;}
    const binding:ConnectionBinding={projectId:project.id,userId:actor.id,authVersion:actor.auth_version,sessionId:request.session.sessionId};return {actor,binding};
  }
  function failure(error:unknown,reply:FastifyReply) {
    const code=error instanceof ProposalError?error.code:providerCode(error);
    const status=code==='NOT_FOUND'?404:code==='FORBIDDEN'?403:code==='USAGE_LIMIT'?429:['INVALID_TARGET_DATE','TARGET_BEFORE_START','NO_CHANGE','SENSITIVE_CONTEXT','REASON_REQUIRED','INVALID_REQUEST','UNSUPPORTED_EFFORT'].includes(code)?400:['CONFLICT','SOURCE_CHANGED','NO_SOURCE','CONNECTION_REQUIRED','MODEL_NOT_AVAILABLE','AUTHORIZATION_EXPIRED','MISSING_REVIEW'].includes(code)?409:503;
    const messages:Record<string,string>={SOURCE_CHANGED:'La fuente o la configuración cambiaron o la lectura venció. Actualiza Trello, ejecuta una supervisión y prepara una nueva versión.',CONFLICT:'El estado o la versión cambiaron, o hay un proceso activo. Actualiza antes de continuar.',NO_SOURCE:'Ejecuta una supervisión con datos de Trello antes de preparar propuestas.',INVALID_TARGET_DATE:'Selecciona una fecha futura válida.',TARGET_BEFORE_START:'La nueva fecha no puede ser anterior al inicio registrado. Elige una fecha coherente con la planificación.',NO_CHANGE:'La nueva fecha coincide con la actual.',REASON_REQUIRED:'Indica el motivo de tu decisión.',SENSITIVE_CONTEXT:'El texto contiene posibles credenciales o supera el límite. Retíralas antes de enviarlo.',UNSUPPORTED_EFFORT:'El modelo no admite ese nivel de razonamiento.',CONNECTION_REQUIRED:'Conecta ChatGPT desde el panel del proveedor.',AUTHORIZATION_EXPIRED:'La conexión venció. Vuelve a conectar ChatGPT.',MODEL_NOT_AVAILABLE:'Selecciona un modelo disponible en tu cuenta.'};
    return reply.code(status).send({code,message:messages[code]??'No se pudo completar la operación. Consulta el estado antes de reintentar.'});
  }
  const change={oneOf:[{type:'object',additionalProperties:false,required:['family','start','due'],properties:{family:{const:'dates'},start:{type:'string',format:'date-time'},due:{type:'string',format:'date-time'}}},{type:'object',additionalProperties:false,required:['family','memberIds'],properties:{family:{const:'members'},memberIds:{type:'array',minItems:1,maxItems:20,uniqueItems:true,items:{type:'string',pattern:'^[a-f0-9]{24}$'}}}},{type:'object',additionalProperties:false,required:['family','label'],properties:{family:{enum:['priority','state']},label:{type:'string',minLength:1,maxLength:100}}}]};
  const mutation={onRequest:[app.csrfProtection],config:{rateLimit:{max:10,timeWindow:'1 minute'}}};
  app.get<{Params:{projectId:string}}>('/projects/:projectId/proposals',{schema:{params}},async(request,reply)=>{const context=await access(request,reply);if(!context)return reply;return service.overview(context.binding.projectId);});
  const path='/projects/:projectId/proposals/:proposalId/versions/:version';
  app.get<{Params:VersionParams}>(path,{schema:{params:versionParams}},async(request,reply)=>{
    const context=await access(request,reply);if(!context)return reply;const view=await service.version(context.binding.projectId,request.params.proposalId,request.params.version);return view??reply.code(404).send({code:'NOT_FOUND',message:'No se encontró la versión.'});
  });
  app.post<{Params:{projectId:string};Body:ProposalRequest}>('/projects/:projectId/proposals',{...mutation,schema:{params,body:{type:'object',additionalProperties:false,required:['sourceRunId','cardId','goal','model','requestKey'],oneOf:[{required:['requestedDue'],not:{required:['requestedChange']}},{required:['requestedChange'],not:{required:['requestedDue']}}],dependencies:{proposalId:['expectedVersion'],expectedVersion:['proposalId']},properties:{purpose:{type:'string',enum:['demonstration','live']},sourceRunId:uuid,cardId:{type:'string',minLength:1,maxLength:100},requestedDue:{type:'string',format:'date-time'},requestedChange:change,goal:{type:'string',minLength:1,maxLength:1000},model,reasoningEffort:effort,requestKey:uuid,proposalId:uuid,expectedVersion:{type:'integer',minimum:1,maximum:9999}}}}},async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return reply;try{return reply.code(202).send(await service.prepare(context.binding,context.actor,request.body));}catch(error){return failure(error,reply);}
  });
  app.post<{Params:VersionParams;Body:{model:string;reasoningEffort?:ReasoningEffort;requestKey:string}}>(path+'/resume',{...mutation,schema:{params:versionParams,body:{type:'object',additionalProperties:false,required:['model','requestKey'],properties:{model,reasoningEffort:effort,requestKey:uuid}}}},async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return reply;try{return reply.code(202).send(await service.resume(context.binding,context.actor,request.params.proposalId,request.params.version,request.body.model,request.body.reasoningEffort??null,request.body.requestKey));}catch(error){return failure(error,reply);}
  });
  app.post<{Params:VersionParams}>(path+'/recheck',{...mutation,schema:{params:versionParams}},async(request,reply)=>{const context=await access(request,reply,true);if(!context)return reply;try{return await service.recheck(context.binding.projectId,context.actor,request.params.proposalId,request.params.version);}catch(error){return failure(error,reply);}});
  app.post<{Params:VersionParams;Body:{contentHash:string;decision:'approved'|'rejected'|'changes_requested';reason:string;requestKey:string}}>(path+'/decisions',{...mutation,schema:{params:versionParams,body:{type:'object',additionalProperties:false,required:['contentHash','decision','reason','requestKey'],properties:{contentHash:{type:'string',pattern:'^[a-f0-9]{64}$'},decision:{type:'string',enum:['approved','rejected','changes_requested']},reason:{type:'string',maxLength:1000},requestKey:uuid}}}},async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return reply;const body=request.body;try{return await service.decide(context.binding.projectId,context.actor,request.params.proposalId,request.params.version,body.contentHash,body.decision,body.reason,body.requestKey);}catch(error){return failure(error,reply);}
  });
}
