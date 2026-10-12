import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {CodeAnalysisResult,CodeSource,GitHubSnapshot,ReportDetail,ReportSchedule,ReportSummary,TrelloOverview,TrelloSnapshot,TrackingPolicyResponse,WeeklyReport} from '@dev-project-agent/contracts';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {AuthUser} from '../auth/repository.js';
import {assertManager} from '../supervision/access.js';
import {analyzeSources} from '../supervision/analyze.js';
import {fingerprint} from '../proposals/contracts.js';
import {nextWeeklyCutoff} from './schedule.js';

export class ReportError extends Error {constructor(readonly code:string){super('Report operation failed.');}}
interface ScheduleRow {project_id:string;version:number;enabled:boolean;weekday:number;hour:number;minute:number;changed_at:Date;changed_by:string;auth_version:number;period_start:Date;next_cutoff:Date;error_code:string|null}
interface Job {id:string;project_id:string;kind:'scheduled'|'manual';cutoff:Date;period_start:Date;schedule_version:number|null;requested_by:string;auth_version:number;version:number;status:ReportSummary['status'];created_at:Date;finished_at:Date|null;error_code:string|null;request_hash:string}
const summary=(job:Job):ReportSummary=>({id:job.id,version:job.version,kind:job.kind,status:job.status,periodStart:job.period_start.toISOString(),cutoff:job.cutoff.toISOString(),createdAt:job.created_at.toISOString(),finishedAt:job.finished_at?.toISOString()??null,errorCode:job.error_code});
const defaultSchedule:ReportSchedule={version:0,enabled:false,weekday:5,hour:18,minute:0,timeZone:'America/Guayaquil',changedAt:null,nextCutoff:null};
export function reportText(value:string) {
  return value.replace(/(?:sk-[a-zA-Z0-9_-]{16,}|ghp_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{16,}|(?:password|token|secret)\s*[:=]\s*\S+|https?:\/\/\S*?(?:invite|[?&](?:token|key|code|state)=)\S*)/gi,'[dato protegido]').slice(0,2000);
}
function protect<T>(value:T):T {
  if(typeof value==='string')return reportText(value) as T;
  if(Array.isArray(value))return value.map(protect) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,protect(item)])) as T;
  return value;
}
export class ReportService {
  constructor(readonly database:TrelloDatabase) {}
  private async transaction<T>(operation:(client:pg.PoolClient)=>Promise<T>) {
    const client=await this.database.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private async lock(client:pg.PoolClient,projectId:string){await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['reports:'+projectId]);}
  private async scheduleRow(client:Pick<pg.PoolClient,'query'>,projectId:string) {return (await client.query<ScheduleRow>('SELECT s.*,c.period_start,c.next_cutoff,c.error_code FROM report_schedule_cursors c JOIN report_schedule_versions s ON s.project_id=c.project_id AND s.version=c.version WHERE c.project_id=$1',[projectId])).rows[0]??null;}
  async schedule(projectId:string):Promise<ReportSchedule>{const row=await this.scheduleRow(this.database,projectId);return row?{version:row.version,enabled:row.enabled,weekday:row.weekday,hour:row.hour,minute:row.minute,timeZone:'America/Guayaquil',changedAt:row.changed_at.toISOString(),nextCutoff:row.enabled?row.next_cutoff.toISOString():null,errorCode:row.error_code}:defaultSchedule;}
  async overview(projectId:string) {return {schedule:await this.schedule(projectId),reports:(await this.database.query<Job>('SELECT * FROM report_jobs WHERE project_id=$1 ORDER BY cutoff DESC,version DESC,id DESC LIMIT 60',[projectId])).rows.map(summary)};}
  async detail(projectId:string,id:string):Promise<ReportDetail|null>{const row=(await this.database.query<Job&{data:WeeklyReport|null;content_hash:string|null}>('SELECT j.*,r.data,r.content_hash FROM report_jobs j LEFT JOIN report_results r ON r.project_id=j.project_id AND r.report_id=j.id WHERE j.project_id=$1 AND j.id=$2',[projectId,id])).rows[0];return row?{...summary(row),contentHash:row.content_hash,data:row.data}:null;}
  async configure(projectId:string,actor:AuthUser,request:{expectedVersion:number;enabled:boolean;weekday:number;hour:number;minute:number}) {
    nextWeeklyCutoff(new Date(),request.weekday,request.hour,request.minute);
    return this.transaction(async client=>{
      await this.lock(client,projectId);await assertManager(client,projectId,actor);const previous=await this.scheduleRow(client,projectId);
      if((previous?.version??0)!==request.expectedVersion)throw new ReportError('CONFLICT');
      const now=new Date();if(previous?.enabled)await this.enqueueDue(client,previous,now,100);
      if(previous?.enabled&&(await this.scheduleRow(client,projectId))!.next_cutoff<=now)throw new ReportError('BACKLOG_PENDING');
      const version=request.expectedVersion+1,start=previous?.enabled?(await this.scheduleRow(client,projectId))!.period_start:now;
      await client.query('INSERT INTO report_schedule_versions(project_id,version,enabled,weekday,hour,minute,changed_by,auth_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[projectId,version,request.enabled,request.weekday,request.hour,request.minute,actor.id,actor.auth_version]);
      await client.query('INSERT INTO report_schedule_cursors(project_id,version,period_start,next_cutoff) VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO UPDATE SET version=EXCLUDED.version,period_start=EXCLUDED.period_start,next_cutoff=EXCLUDED.next_cutoff,error_code=NULL',[projectId,version,start,nextWeeklyCutoff(now,request.weekday,request.hour,request.minute)]);
      await this.audit(client,projectId,actor.id,'report.schedule','succeeded',String(version));
      const row=await this.scheduleRow(client,projectId);return {version,enabled:row!.enabled,weekday:row!.weekday,hour:row!.hour,minute:row!.minute,timeZone:'America/Guayaquil' as const,changedAt:row!.changed_at.toISOString(),nextCutoff:row!.enabled?row!.next_cutoff.toISOString():null};
    });
  }
  private async audit(client:Pick<pg.PoolClient,'query'>,projectId:string,actorId:string|null,action:string,outcome:string,id:string){await client.query("INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,$2,$3,$4,'report',$5,$6)",[projectId,actorId?'user':'system',actorId,action,id,outcome]);}
  private async enqueueDue(client:pg.PoolClient,schedule:ScheduleRow,now:Date,limit:number) {
    let cutoff=schedule.next_cutoff,start=schedule.period_start,count=0;
    while(cutoff<=now&&count++<limit){
      await client.query("INSERT INTO report_jobs(project_id,kind,cutoff,period_start,schedule_version,requested_by,auth_version,request_key,request_hash,version) VALUES($1,'scheduled',$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT(project_id,kind,cutoff,version) DO NOTHING",[schedule.project_id,cutoff,start,schedule.version,schedule.changed_by,schedule.auth_version,randomUUID(),fingerprint({kind:'scheduled',cutoff:cutoff.toISOString(),schedule:schedule.version})]);
      start=cutoff;cutoff=nextWeeklyCutoff(cutoff,schedule.weekday,schedule.hour,schedule.minute);
    }
    await client.query('UPDATE report_schedule_cursors SET period_start=$2,next_cutoff=$3 WHERE project_id=$1 AND version=$4',[schedule.project_id,start,cutoff,schedule.version]);
  }
  async enqueueScheduled(now=new Date()) {
    const schedules=await this.database.query<{project_id:string}>("SELECT c.project_id FROM report_schedule_cursors c JOIN report_schedule_versions s ON s.project_id=c.project_id AND s.version=c.version WHERE s.enabled AND c.error_code IS NULL AND c.next_cutoff<=$1 ORDER BY c.next_cutoff LIMIT 20",[now]);
    for(const row of schedules.rows)await this.transaction(async client=>{await this.lock(client,row.project_id);const schedule=await this.scheduleRow(client,row.project_id);if(schedule?.enabled&&!schedule.error_code){try{await assertManager(client,row.project_id,{id:schedule.changed_by,auth_version:schedule.auth_version});}catch(error){if(!error||typeof error!=='object'||!('code' in error)||error.code!=='FORBIDDEN')throw error;await client.query("UPDATE report_schedule_cursors SET error_code='FORBIDDEN' WHERE project_id=$1",[row.project_id]);await this.audit(client,row.project_id,null,'report.schedule','denied',String(schedule.version));return;}await this.enqueueDue(client,schedule,now,20);}});
  }
  async request(projectId:string,actor:AuthUser,requestKey:string,revisionOf?:string) {
    return this.transaction(async client=>{
      await this.lock(client,projectId);await assertManager(client,projectId,actor);const hash=fingerprint({revisionOf:revisionOf??null});
      const prior=(await client.query<Job>('SELECT * FROM report_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[projectId,actor.id,requestKey])).rows[0];
      if(prior){if(prior.request_hash!==hash)throw new ReportError('CONFLICT');return summary(prior);}
      const original=revisionOf?(await client.query<Job>('SELECT * FROM report_jobs WHERE project_id=$1 AND id=$2',[projectId,revisionOf])).rows[0]:null;
      if(revisionOf&&!original)throw new ReportError('NOT_FOUND');if(original?.status==='queued')throw new ReportError('CONFLICT');
      const cutoff=original?.cutoff??new Date(),kind=original?.kind??'manual';
      const previous=(await client.query<{cutoff:Date}>('SELECT cutoff FROM report_jobs WHERE project_id=$1 AND cutoff<$2 ORDER BY cutoff DESC LIMIT 1',[projectId,cutoff])).rows[0];
      const activation=await this.scheduleRow(client,projectId);
      const start=original?.period_start??previous?.cutoff??(activation?.period_start&&activation.period_start<cutoff?activation.period_start:new Date(Math.max(cutoff.getTime()-7*86_400_000,(await client.query<{created_at:Date}>('SELECT created_at FROM projects WHERE id=$1',[projectId])).rows[0]!.created_at.getTime())));
      const version=(await client.query<{version:number}>('SELECT COALESCE(MAX(version),0)+1 AS version FROM report_jobs WHERE project_id=$1 AND kind=$2 AND cutoff=$3',[projectId,kind,cutoff])).rows[0]!.version;
      const inserted=(await client.query<Job>('INSERT INTO report_jobs(project_id,kind,cutoff,period_start,schedule_version,requested_by,auth_version,request_key,request_hash,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[projectId,kind,cutoff,start,original?.schedule_version??activation?.version??null,actor.id,actor.auth_version,requestKey,hash,version])).rows[0]!;
      await this.audit(client,projectId,actor.id,'report.request','requested',inserted.id);return summary(inserted);
    });
  }
  async processNext() {
    let jobId:string|null=null;
    try{return await this.transaction(async client=>{
      const job=(await client.query<Job>("SELECT * FROM report_jobs WHERE status='queued' ORDER BY cutoff,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!job)return false;jobId=job.id;
      await assertManager(client,job.project_id,{id:job.requested_by,auth_version:job.auth_version});
      const data=await this.build(client,job),published=data.stages.every(stage=>stage.outcome==='pass'),hash=fingerprint(data);
      await client.query('INSERT INTO report_results(project_id,report_id,content_hash,data) VALUES($1,$2,$3,$4)',[job.project_id,job.id,hash,JSON.stringify(data)]);
      await client.query('UPDATE report_jobs SET status=$2,finished_at=clock_timestamp() WHERE id=$1',[job.id,published?'published':'draft']);
      await this.audit(client,job.project_id,null,'report.publish',published?'succeeded':'failed',job.id);return true;
    });}catch(error){
      if(jobId){const row=(await this.database.query<Job>('UPDATE report_jobs SET status=\'failed\',finished_at=clock_timestamp(),error_code=$2 WHERE id=$1 AND status=\'queued\' RETURNING *',[jobId,error&&typeof error==='object'&&'code' in error&&error.code==='FORBIDDEN'?'FORBIDDEN':'REPORT_GENERATION_FAILED'])).rows[0];if(row)await this.audit(this.database,row.project_id,null,'report.generate','failed',row.id);}else throw error;return true;
    }
  }
  private async build(client:pg.PoolClient,job:Job):Promise<WeeklyReport> {
    const {project_id:projectId,cutoff}=job,generatedAt=new Date();
    const project=(await client.query<{id:string;name:string}>('SELECT id,name FROM projects WHERE id=$1',[projectId])).rows[0]!;
    const manager=(await client.query<{id:string;display_name:string}>('SELECT id,display_name FROM users WHERE id=$1',[job.requested_by])).rows[0]!;
    // Prefer an observation available by the cutoff; a later fallback is explicitly labelled.
    const trello=(await client.query<{id:string;source:'api'|'export';observed_at:Date;imported_at:Date;data:TrelloSnapshot}>(`SELECT * FROM trello_snapshots WHERE project_id=$1 AND observed_at<=$2 AND imported_at<=$3
      ORDER BY (observed_at<=$4 AND imported_at<=$4) DESC, CASE WHEN observed_at<=$4 AND imported_at<=$4 THEN observed_at END DESC,observed_at ASC,id LIMIT 1`,[projectId,generatedAt,generatedAt,cutoff])).rows[0];
    const github=(await client.query<{id:string;observed_at:Date;data:GitHubSnapshot}>(`SELECT * FROM github_snapshots WHERE project_id=$1 AND observed_at<=$2 ORDER BY (observed_at<=$3) DESC,CASE WHEN observed_at<=$3 THEN observed_at END DESC,observed_at ASC,id LIMIT 1`,[projectId,generatedAt,cutoff])).rows[0];
    const policy=(await client.query<{priority_labels:NonNullable<TrackingPolicyResponse['priorityLabels']>;blocked_labels:string[];state_labels:NonNullable<TrackingPolicyResponse['stateLabels']>;version:number;due_soon_hours:number;stale_after_minutes:number;confirmed:boolean;changed_at:Date}>(`SELECT * FROM tracking_policy_versions WHERE project_id=$1 AND changed_at<=$2 ORDER BY (changed_at<=$3) DESC,CASE WHEN changed_at<=$3 THEN version END DESC,version ASC LIMIT 1`,[projectId,generatedAt,cutoff])).rows[0];
    const baseline=(await client.query<{version:number;data:TrelloSnapshot}>('SELECT b.version,s.data FROM baseline_versions b JOIN trello_snapshots s ON s.project_id=b.project_id AND s.id=b.snapshot_id WHERE b.project_id=$1 AND b.confirmed_at<=$2 ORDER BY b.version DESC LIMIT 1',[projectId,cutoff])).rows[0]??null;
    const sources:WeeklyReport['sources']=[];
    if(trello)sources.push({kind:'trello',id:trello.id,observedAt:trello.observed_at.toISOString(),timing:trello.observed_at>cutoff||trello.imported_at>cutoff?'after_cutoff':'before_cutoff',ageMinutes:trello.observed_at>cutoff?null:(cutoff.getTime()-trello.observed_at.getTime())/60_000});
    if(github)sources.push({kind:'github',id:github.id,observedAt:github.observed_at.toISOString(),timing:github.observed_at>cutoff?'after_cutoff':'before_cutoff',ageMinutes:github.observed_at>cutoff?null:(cutoff.getTime()-github.observed_at.getTime())/60_000,commit:github.data.head,branch:github.data.branch});
    const observedAfter=sources.some(source=>source.timing==='after_cutoff'),evaluationAt=trello&&(trello.observed_at>cutoff||trello.imported_at>cutoff)?generatedAt:cutoff;
    const trelloOverview:TrelloOverview|null=trello?{connection:{boardId:trello.data.board.id,apiConfigured:false},latest:{id:trello.id,source:trello.source,observedAt:trello.observed_at.toISOString(),importedAt:trello.imported_at.toISOString(),data:trello.data,changes:[]},lastAttempt:null}:null;
    const configuration:TrackingPolicyResponse|null=policy?{priorityLabels:policy.priority_labels,blockedLabels:policy.blocked_labels,stateLabels:policy.state_labels,version:policy.version,dueSoonHours:policy.due_soon_hours,staleAfterMinutes:policy.stale_after_minutes,confirmed:policy.confirmed,changedAt:policy.changed_at.toISOString(),changedBy:null}:null;
    const analysis=configuration?analyzeSources(trelloOverview,{connection:null,latest:github?{id:github.id,observedAt:github.observed_at.toISOString(),data:github.data}:null,lastAttempt:null},configuration,baseline,evaluationAt):null;
    const tracking=analysis?.tracking??null,items=trello?.data.items.filter(item=>!item.archived&&item.kind!=='reference')??[];
    const universe=items.filter(item=>item.kind==='activity').map(item=>item.id).sort();
    const previous=(await client.query<{data:WeeklyReport}>("SELECT r.data FROM report_results r JOIN report_jobs j ON j.id=r.report_id AND j.project_id=r.project_id WHERE j.project_id=$1 AND j.status='published' AND j.cutoff<$2 ORDER BY j.cutoff DESC,j.version DESC LIMIT 1",[projectId,cutoff])).rows[0]?.data;
    const comparable=previous&&fingerprint(previous.activityUniverse)===fingerprint(universe)&&!observedAfter&&previous.sources.every(source=>source.timing==='before_cutoff')&&tracking?.summary?.progress.percent!==null&&previous.tracking?.summary?.progress.percent!==null;
    const progressChangePoints=comparable&&tracking?.summary&&previous?.tracking?.summary?Math.round((tracking.summary.progress.percent!-previous.tracking.summary.progress.percent!)*100)/100:null;
    const events=(await client.query<{id:string;action:string;outcome:string;actor:string|null;resourceId:string;createdAt:Date}>(`SELECT a.id,a.action,a.outcome,u.display_name AS actor,a.resource_id AS "resourceId",a.occurred_at AS "createdAt" FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.project_id=$1 AND a.occurred_at>=$2 AND a.occurred_at<$3 AND a.resource_type IN ('proposal','code_review','execution_job') ORDER BY a.occurred_at,a.id LIMIT 1001`,[projectId,job.period_start,cutoff])).rows;
    const actions=(await client.query<Omit<WeeklyReport['actions'][number],'createdAt'>&{createdAt:Date}>(`SELECT x.*,u.display_name AS actor FROM (
      SELECT v.proposal_id::text||':v'||v.version AS id,v.proposal_id AS "proposalId",v.version,p.purpose,'trello'::text AS target,'proposed'::text AS action,'prepared'::text AS outcome,v.created_by AS actor_id,v.created_at AS "createdAt" FROM proposal_versions v JOIN proposals p ON p.project_id=v.project_id AND p.id=v.proposal_id WHERE v.project_id=$1
      UNION ALL SELECT d.id::text,d.proposal_id,d.version,p.purpose,'trello',d.decision,'recorded',d.actor_id,d.created_at FROM proposal_decisions d JOIN proposals p ON p.project_id=d.project_id AND p.id=d.proposal_id WHERE d.project_id=$1
      UNION ALL SELECT v.proposal_id::text||':v'||v.version,v.proposal_id,v.version,p.purpose,'code','proposed','prepared',p.created_by,v.created_at FROM code_versions v JOIN code_proposals p ON p.project_id=v.project_id AND p.id=v.proposal_id WHERE v.project_id=$1
      UNION ALL SELECT d.id::text,d.proposal_id,d.version,p.purpose,'code',d.decision,'recorded',d.actor_id,d.created_at FROM code_decisions d JOIN code_proposals p ON p.project_id=d.project_id AND p.id=d.proposal_id WHERE d.project_id=$1
      UNION ALL SELECT e.id::text,j.proposal_id,j.version,p.purpose,'trello',e.stage,e.outcome,j.requested_by,e.created_at FROM execution_events e JOIN execution_jobs j ON j.project_id=e.project_id AND j.id=e.job_id JOIN proposals p ON p.project_id=j.project_id AND p.id=j.proposal_id WHERE e.project_id=$1
      UNION ALL SELECT c.id::text,c.proposal_id,c.version,'demonstration','code','publication','simulated',c.actor_id,c.created_at FROM code_publications c WHERE c.project_id=$1
      ) x LEFT JOIN users u ON u.id=x.actor_id WHERE x."createdAt">=$2 AND x."createdAt"<$3 ORDER BY x."createdAt",x.id LIMIT 1001`,[projectId,job.period_start,cutoff])).rows;
    const code=(await client.query<{id:string;source:CodeSource;result:CodeAnalysisResult;finished_at:Date}>("SELECT a.id,a.finished_at,s.source,r.result FROM code_analyses a JOIN code_sources s ON s.project_id=a.project_id AND s.analysis_id=a.id JOIN code_results r ON r.project_id=a.project_id AND r.analysis_id=a.id WHERE a.project_id=$1 AND a.status='ready' AND a.finished_at<=$2 ORDER BY a.finished_at DESC,a.id DESC LIMIT 1",[projectId,cutoff])).rows[0];
    const limitations=[...(tracking?.limitations??[]),...(analysis?.limitations.filter(value=>!value.includes('revisión de código por IA'))??[]),'Reporte preparado y revisado mediante reglas deterministas; no se ha solicitado una nueva revisión de IA.','La validación permite publicación interna, no autoriza cambios externos.','Los hallazgos de código conservan su confianza y comprobaciones originales; no son una certificación ISO.'];
    if(!policy)limitations.push('No hay configuración de seguimiento; los indicadores quedan pendientes.');
    if(policy&&policy.changed_at>cutoff)limitations.push('La configuración disponible se confirmó después del corte; no reconstruye una política histórica.');
    if(observedAfter)limitations.push('Hay observaciones posteriores al corte. Se muestran como evidencia posterior y no como estado histórico del periodo.');
    if(!code)limitations.push('No hay revisión de código terminada antes del corte.');
    if(code&&github&&code.source.head!==github.data.head)limitations.push('La revisión de código corresponde a un commit distinto del último observado.');
    if(events.length>1000||actions.length>1000)limitations.push('Se muestran los primeros 1000 eventos y acciones de cada lista del periodo; el historial completo permanece en la base de datos.');
    const failures=await client.query<{action:string;outcome:string}>('SELECT action,outcome FROM audit_events WHERE project_id=$1 AND occurred_at>=$2 AND occurred_at<$3 AND action IN (\'trello.sync\',\'github.sync\') AND outcome=\'failed\' LIMIT 20',[projectId,job.period_start,cutoff]);
    if(failures.rows.length)limitations.push('Se registraron fallos de lectura durante el periodo; las observaciones guardadas no cubren necesariamente todo el intervalo.');
    const recommendations=[...(tracking?.summary?.activities.overdue?['Revisar con los responsables las actividades vencidas y proponer ajustes con evidencia.']:[]),...(tracking?.summary?.activities.dueSoon?['Confirmar el trabajo restante y los próximos vencimientos.']:[]),...(!baseline?['Confirmar una línea base para comparar desviaciones de planificación.']:[]),...(!code?['Solicitar una revisión de código con alcance y commit explícitos.']:[]),'Revisar las decisiones pendientes en el panel; cualquier modificación requiere aprobación específica del gestor.'];
    const now=generatedAt.toISOString(),hasData=!!tracking?.summary;
    const checks=[{code:'evidence',passed:hasData,message:hasData?'Indicadores vinculados a una lectura identificada.':'Falta evidencia de Trello para calcular avance.'},{code:'progress',passed:!tracking?.summary||tracking.summary.progress.numerator<=tracking.summary.progress.denominator,message:'Se distingue avance declarado de aceptación y se conserva el universo de actividades.'},{code:'period',passed:job.period_start<=cutoff,message:'Eventos filtrados en el intervalo de inicio inclusive y corte exclusivo.'}];
    const reviewed=checks.every(check=>check.passed);
    return protect({schemaVersion:1,project,responsible:{id:manager.id,name:manager.display_name},periodStart:job.period_start.toISOString(),cutoff:cutoff.toISOString(),generatedAt:now,partialPeriod:cutoff.getTime()-job.period_start.getTime()<7*86_400_000,late:job.kind==='scheduled'&&generatedAt.getTime()-cutoff.getTime()>60_000,policyVersion:policy?.version??null,scheduleVersion:job.schedule_version,baselineVersion:baseline?.version??null,
      executiveSummary:tracking?.summary?`Avance declarado: ${tracking.summary.progress.percent??'no calculable'} %. Actividades vencidas: ${tracking.summary.activities.overdue}; próximas: ${tracking.summary.activities.dueSoon}. ${observedAfter?'Observación posterior al corte.':'Indicadores calculados desde la lectura disponible al corte.'}`:'No hay evidencia suficiente para calcular el avance; el reporte permanece en borrador.',
      tracking,progressChangePoints,comparisonNote:progressChangePoints===null?'No se comparan porcentajes: falta un reporte comparable o cambió el universo o el momento de observación.':`Variación: ${progressChangePoints} puntos porcentuales entre universos comparables.`,
      activities:items.map(item=>{const status=tracking?.items.find(value=>value.itemId===item.id);return {id:item.id,name:item.name,kind:item.kind,state:item.state,due:item.due,principal:item.planning?.principal??null,responsibles:item.memberIds.map(id=>trello!.data.members.find(member=>member.id===id)?.displayName??'Responsable no resuelto'),schedule:status?.schedule??null,overdueHours:status?.overdueHours??null,blocked:status?.blocked??null};}),
      dependencies:analysis?.dependencies??[],deviations:analysis?.deviations??[],code:code?{id:code.id,commit:code.source.head,observedAt:code.source.observedAt,finishedAt:code.finished_at.toISOString(),files:code.source.files.map(file=>file.path),result:code.result}:null,
      events:events.slice(0,1000).map(event=>({...event,createdAt:event.createdAt.toISOString()})),actions:actions.slice(0,1000).map(item=>({id:item.id,proposalId:item.proposalId,version:item.version,purpose:item.purpose,target:item.target,action:item.action,outcome:item.outcome,actor:item.actor,createdAt:item.createdAt.toISOString()})),recommendations,
      nextWeek:items.filter(item=>item.state!=='completed'&&item.due&&Date.parse(item.due)>=cutoff.getTime()&&Date.parse(item.due)<=cutoff.getTime()+7*86_400_000).map(item=>({id:item.id,name:item.name,kind:item.kind,due:item.due!})),sources,limitations:[...new Set(limitations)],activityUniverse:universe,
      stages:[{stage:'executor',engine:'deterministic',outcome:'pass',checkedAt:now,checks:[{code:'snapshot',passed:true,message:'Contenido preparado desde lecturas persistidas y campos delimitados.'}]},{stage:'reviewer',engine:'deterministic',outcome:reviewed?'pass':'fail',checkedAt:now,checks},{stage:'approver',engine:'deterministic',outcome:reviewed?'pass':'fail',checkedAt:now,checks:[{code:'internal_publication',passed:reviewed,message:reviewed?'La revisión permite publicar el reporte dentro del panel.':'La revisión requiere evidencia adicional; se conserva un borrador.'},{code:'no_external_changes',passed:true,message:'La publicación interna no ejecuta propuestas ni envía mensajes externos.'}]}]});
  }
}
export function startReportWorker(service:ReportService,onError:()=>void) {
  let stopped=false,pending:Promise<void>|null=null;
  const tick=()=>{if(stopped||pending)return;pending=(async()=>{await service.enqueueScheduled();for(let index=0;index<10&&!stopped&&await service.processNext();index++){} })().catch(onError).finally(()=>{pending=null;});};
  const timer=setInterval(tick,10_000);tick();return {close:async()=>{stopped=true;clearInterval(timer);await pending;}};
}
