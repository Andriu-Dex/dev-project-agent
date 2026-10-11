import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthRepository, AuthUser } from '../auth/repository.js';
import type { SupervisionJobKind } from '@dev-project-agent/contracts';
import { githubOverview } from '../../integrations/github/service.js';
import { overview } from '../../integrations/trello/service.js';
import { confirmBaseline, latestBaseline } from './baseline.js';
import { enqueueJob, getJob, getRun, supervisionOverview } from './jobs.js';
import { SupervisionError } from './access.js';
import type { SupervisionOptions } from './worker.js';

export function registerSupervisionRoutes(app:FastifyInstance,options:SupervisionOptions,requireUser:(request:FastifyRequest,reply:FastifyReply)=>Promise<AuthUser|null>,repository:AuthRepository) {
  const params={type:'object',required:['projectId'],properties:{projectId:{type:'string',format:'uuid'}}} as const;
  async function access(request:FastifyRequest<{Params:{projectId:string}}>,reply:FastifyReply,manager=false) {
    const user=await requireUser(request,reply);if(!user)return null;
    const project=await repository.projectForUser(user.id,request.params.projectId);
    if(!project){reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el proyecto.'});return null;}
    if(manager&&!project.canManageProject){
      await repository.audit(project.id,user.id,'supervision.manage','denied',project.id);
      reply.code(403).send({code:'FORBIDDEN',message:'Esta operación requiere permisos de gestor.'});return null;
    }
    return {user,project};
  }
  function failure(error:unknown,reply:FastifyReply) {
    if(!(error instanceof SupervisionError))throw error;
    const status=error.code==='FORBIDDEN'?403:['CONFLICT','SOURCE_CHANGED'].includes(error.code)?409:error.code==='NOT_FOUND'?404:error.code==='NO_DATA'?400:503;
    return reply.code(status).send({code:error.code,message:status===409?'La información cambió o hay un trabajo activo. Actualiza el panel antes de continuar.':status===403?'Tu cuenta ya no tiene permisos para esta operación.':error.code==='NO_DATA'?'No hay una lectura válida para esta operación.':'No se pudo completar la operación.'});
  }
  app.get<{Params:{projectId:string}}>('/projects/:projectId/github',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);if(!context)return;
    return githubOverview(options.database,context.project.id);
  });
  app.get<{Params:{projectId:string}}>('/projects/:projectId/baseline',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);if(!context)return;
    const baseline=await latestBaseline(options.database,context.project.id);
    const source=await overview(options.database,context.project.id,Boolean(options.trelloCredentials));
    const latest=source?.latest;const items=latest?.data.items.filter(item=>!item.archived&&item.kind!=='reference')??[];
    return {baseline:baseline?{version:baseline.version,snapshotId:baseline.snapshotId,confirmedAt:baseline.confirmedAt,confirmedBy:baseline.confirmedBy}:null,
      candidate:latest?{snapshotId:latest.id,source:latest.source,observedAt:latest.observedAt,activities:items.filter(item=>item.kind==='activity').length,milestones:items.filter(item=>item.kind==='milestone').length}:null};
  });
  app.post<{Params:{projectId:string};Body:{expectedVersion:number;snapshotId:string}}>('/projects/:projectId/baseline-versions',{
    schema:{params,body:{type:'object',additionalProperties:false,required:['expectedVersion','snapshotId'],properties:{expectedVersion:{type:'integer',minimum:0},snapshotId:{type:'string',format:'uuid'}}}},onRequest:[app.csrfProtection],
  },async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return;
    try{const baseline=await confirmBaseline(options.database,context.project.id,context.user,request.body.expectedVersion,request.body.snapshotId);
      return reply.code(201).send({version:baseline.version,snapshotId:baseline.snapshotId,confirmedAt:baseline.confirmedAt,confirmedBy:baseline.confirmedBy});}
    catch(error){return failure(error,reply);}
  });
  app.get<{Params:{projectId:string}}>('/projects/:projectId/supervision',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);if(!context)return;
    return supervisionOverview(options.database,context.project.id);
  });
  app.post<{Params:{projectId:string};Body:{kind:SupervisionJobKind;requestKey:string}}>('/projects/:projectId/supervision/jobs',{
    schema:{params,body:{type:'object',additionalProperties:false,required:['kind','requestKey'],properties:{kind:{type:'string',enum:['trello_sync','github_sync','analysis','full']},requestKey:{type:'string',format:'uuid'}}}},
    onRequest:[app.csrfProtection],config:{rateLimit:{max:10,timeWindow:'1 minute'}},
  },async(request,reply)=>{
    const context=await access(request,reply,true);if(!context)return;
    try{return reply.code(202).send(await enqueueJob(options.database,context.project.id,context.user,request.body.kind,request.body.requestKey));}
    catch(error){return failure(error,reply);}
  });
  for(const resource of ['jobs','runs'] as const) app.get<{Params:{projectId:string;resourceId:string}}>(`/projects/:projectId/supervision/${resource}/:resourceId`,{
    schema:{params:{...params,required:['projectId','resourceId'],properties:{...params.properties,resourceId:{type:'string',format:'uuid'}}}},
  },async(request,reply)=>{
    const context=await access(request,reply);if(!context)return;
    const result=resource==='jobs'?await getJob(options.database,context.project.id,request.params.resourceId):await getRun(options.database,context.project.id,request.params.resourceId);
    return result??reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el registro.'});
  });
}
