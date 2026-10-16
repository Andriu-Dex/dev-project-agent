import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import type {CoverageSettings} from '@dev-project-agent/contracts';
import type {AuthRepository,AuthUser} from '../auth/repository.js';
import {CoverageService} from './coverage.js';

export function registerCoverageRoutes(app:FastifyInstance,service:CoverageService,requireUser:(request:FastifyRequest,reply:FastifyReply)=>Promise<AuthUser|null>,repository:AuthRepository) {
  const root='/projects/:projectId/code-review/coverage';
  const params={type:'object',additionalProperties:false,required:['projectId'],properties:{projectId:{type:'string',format:'uuid'}}};
  const revision={type:'integer',minimum:0},nullableString={type:['string','null'],maxLength:100};
  const settings={type:'object',additionalProperties:false,required:['batchUnits','partBytes','contextBytes','maxSeconds','intervalMinutes','maxAttempts','withAi','model','reasoningEffort','consent'],properties:{batchUnits:{type:'integer',minimum:1,maximum:20},partBytes:{type:'integer',minimum:1000,maximum:24000},contextBytes:{type:'integer',minimum:0,maximum:16000},maxSeconds:{type:'integer',minimum:10,maximum:600},intervalMinutes:{type:'integer',minimum:1,maximum:10080},maxAttempts:{type:'integer',minimum:1,maximum:5},withAi:{type:'boolean'},model:nullableString,reasoningEffort:{type:['string','null'],enum:[null,'low','medium','high','xhigh','max']},consent:{type:'boolean'}}};
  async function access(request:FastifyRequest<{Params:{projectId:string}}>,reply:FastifyReply,manage=false){
    const actor=await requireUser(request,reply);if(!actor)return null;
    const project=await repository.projectForUser(actor.id,request.params.projectId);
    if(!project){reply.code(404).send({code:'NOT_FOUND',message:'No se encontró el proyecto.'});return null;}
    if(manage&&!project.canManageProject){reply.code(403).send({code:'FORBIDDEN',message:'Esta operación requiere permisos de gestor.'});return null;}
    return actor;
  }
  async function run(reply:FastifyReply,operation:()=>Promise<unknown>){try{return await operation();}catch(error){
    const code=error&&typeof error==='object'&&'code'in error?String(error.code):'COVERAGE_UNAVAILABLE';
    const messages:Record<string,string>={CONFLICT:'La cobertura cambió o hay una tanda activa. Actualiza y espera a que termine antes de configurar.',NOT_CONFIGURED:'Configura GitHub antes de preparar el inventario.',INCOMPLETE_SOURCE:'GitHub no devolvió un inventario completo dentro del límite. No se reemplazó la cobertura guardada.',SOURCE_CHANGED:'Cambió la conexión de GitHub. Actualiza el inventario.',CONSENT_REQUIRED:'Selecciona el modelo y confirma el envío de código al proveedor.',UNSUPPORTED_EFFORT:'El modelo no admite ese nivel de razonamiento.',INPUT_TOO_LARGE:'Para Ollama, la suma de fragmento y contexto debe ser de hasta 12 000 bytes.',FORBIDDEN:'Los permisos del gestor cambiaron.'};
    return reply.code(code==='FORBIDDEN'?403:code==='CONFLICT'?409:['CONSENT_REQUIRED','INPUT_TOO_LARGE','UNSUPPORTED_EFFORT','INVALID_REQUEST'].includes(code)?400:503).send({code,message:messages[code]??'No se pudo completar la operación. Consulta el estado antes de reintentar.'});
  }}
  app.get<{Params:{projectId:string}}>(root,{schema:{params}},async(request,reply)=>{if(!await access(request,reply))return reply;return run(reply,()=>service.overview(request.params.projectId));});
  app.get<{Params:{projectId:string};Querystring:{state?:string;search?:string;page?:number}}>(root+'/files',{schema:{params,querystring:{type:'object',additionalProperties:false,properties:{state:{type:'string',enum:['pending','reviewing','reviewed','partial','outdated','failed','excluded']},search:{type:'string',maxLength:240},page:{type:'integer',minimum:1,maximum:10000}}}}},async(request,reply)=>{if(!await access(request,reply))return reply;return run(reply,()=>service.files(request.params.projectId,request.query.state??null,request.query.search??'',request.query.page??1));});
  app.get<{Params:{projectId:string};Querystring:{path:string}}>(root+'/results',{schema:{params,querystring:{type:'object',additionalProperties:false,required:['path'],properties:{path:{type:'string',minLength:1,maxLength:1000}}}}},async(request,reply)=>{if(!await access(request,reply))return reply;return run(reply,()=>service.results(request.params.projectId,request.query.path));});
  const mutation={onRequest:[app.csrfProtection],config:{rateLimit:{max:10,timeWindow:'1 minute'}}};
  app.post<{Params:{projectId:string};Body:{expectedRevision:number}}>(root+'/inventory',{...mutation,schema:{params,body:{type:'object',additionalProperties:false,required:['expectedRevision'],properties:{expectedRevision:revision}}}},async(request,reply)=>{const actor=await access(request,reply,true);if(!actor)return reply;return run(reply,()=>service.inventory(request.params.projectId,actor,request.body.expectedRevision));});
  app.post<{Params:{projectId:string};Body:{expectedRevision:number;settings:CoverageSettings}}>(root+'/settings',{...mutation,schema:{params,body:{type:'object',additionalProperties:false,required:['expectedRevision','settings'],properties:{expectedRevision:revision,settings}}}},async(request,reply)=>{const actor=await access(request,reply,true);if(!actor)return reply;return run(reply,()=>service.configure(request.params.projectId,actor,request.body.expectedRevision,request.body.settings));});
  app.post<{Params:{projectId:string};Body:{expectedRevision:number;action:'start'|'pause'|'retry'}}>(root+'/control',{...mutation,schema:{params,body:{type:'object',additionalProperties:false,required:['expectedRevision','action'],properties:{expectedRevision:revision,action:{type:'string',enum:['start','pause','retry']}}}}},async(request,reply)=>{const actor=await access(request,reply,true);if(!actor)return reply;return run(reply,()=>service.control(request.params.projectId,actor,request.body.expectedRevision,request.body.action));});
}
