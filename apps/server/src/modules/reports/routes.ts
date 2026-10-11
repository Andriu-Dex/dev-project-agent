import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import type {AuthRepository,AuthUser} from '../auth/repository.js';
import {ReportService,ReportError} from './service.js';
import {renderReport} from './render.js';

export function registerReportRoutes(app:FastifyInstance,service:ReportService,requireUser:(request:FastifyRequest,reply:FastifyReply)=>Promise<AuthUser|null>,repository:AuthRepository) {
  const params={type:'object',required:['projectId'],properties:{projectId:{type:'string',format:'uuid'},id:{type:'string',format:'uuid'}}} as const;
  async function access(request:FastifyRequest<{Params:{projectId:string}}>,reply:FastifyReply,manager=false){
    const actor=await requireUser(request,reply);if(!actor)return null;
    const project=await repository.projectForUser(actor.id,request.params.projectId);if(!project){reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el proyecto.'});return null;}
    if(manager&&!project.canManageProject){reply.code(403).send({code:'FORBIDDEN',message:'Esta operación requiere permisos de gestor.'});return null;}return {actor,project};
  }
  const failure=(error:unknown,reply:FastifyReply)=>{const code=error instanceof ReportError?error.code:error&&typeof error==='object'&&'code' in error&&error.code==='FORBIDDEN'?'FORBIDDEN':'REPORT_UNAVAILABLE';return reply.code(code==='FORBIDDEN'?403:code==='NOT_FOUND'?404:['CONFLICT','BACKLOG_PENDING'].includes(code)?409:503).send({code,message:code==='CONFLICT'?'La configuración o solicitud cambió. Actualiza los reportes.':code==='BACKLOG_PENDING'?'Se están recuperando periodos pendientes. Espera y vuelve a guardar.':'No se pudo completar la operación de reportes. Puedes volver a intentar.'});};
  app.get<{Params:{projectId:string}}>('/projects/:projectId/reports',{schema:{params}},async(request,reply)=>{const context=await access(request,reply);if(!context)return;return service.overview(context.project.id);});
  app.get<{Params:{projectId:string;id:string}}>('/projects/:projectId/reports/:id',{schema:{params}},async(request,reply)=>{const context=await access(request,reply);if(!context)return;const result=await service.detail(context.project.id,request.params.id);return result??reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el reporte.'});});
  app.get<{Params:{projectId:string;id:string}}>('/projects/:projectId/reports/:id/print',{schema:{params}},async(request,reply)=>{
    const context=await access(request,reply);if(!context)return;const result=await service.detail(context.project.id,request.params.id);if(!result)return reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el reporte.'});
    reply.header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'");reply.header('Referrer-Policy','no-referrer');return reply.type('text/html; charset=utf-8').send(renderReport(result));
  });
  app.post<{Params:{projectId:string};Body:{requestKey:string;revisionOf?:string}}>('/projects/:projectId/reports',{
    schema:{params,body:{type:'object',additionalProperties:false,required:['requestKey'],properties:{requestKey:{type:'string',format:'uuid'},revisionOf:{type:'string',format:'uuid'}}}},onRequest:[app.csrfProtection],config:{rateLimit:{max:10,timeWindow:'1 minute'}},
  },async(request,reply)=>{const context=await access(request,reply,true);if(!context)return;try{return reply.code(202).send(await service.request(context.project.id,context.actor,request.body.requestKey,request.body.revisionOf));}catch(error){return failure(error,reply);}});
  app.put<{Params:{projectId:string};Body:{expectedVersion:number;enabled:boolean;weekday:number;hour:number;minute:number}}>('/projects/:projectId/reports/schedule',{
    schema:{params,body:{type:'object',additionalProperties:false,required:['expectedVersion','enabled','weekday','hour','minute'],properties:{expectedVersion:{type:'integer',minimum:0},enabled:{type:'boolean'},weekday:{type:'integer',minimum:0,maximum:6},hour:{type:'integer',minimum:0,maximum:23},minute:{type:'integer',minimum:0,maximum:59}}}},onRequest:[app.csrfProtection],
  },async(request,reply)=>{const context=await access(request,reply,true);if(!context)return;try{return await service.configure(context.project.id,context.actor,request.body);}catch(error){return failure(error,reply);}});
}
