import {createHash} from 'node:crypto';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {AuthUser} from '../auth/repository.js';
import type {CodeReviewService} from '../code-review/service.js';
import {readCodeCatalog} from '../../integrations/github/code-client.js';
import type {SupervisionOptions} from '../supervision/worker.js';
import {enqueueJob} from '../supervision/jobs.js';
import {assertManager} from '../supervision/access.js';
import {OperationError} from './errors.js';
export {OperationError} from './errors.js';

export interface OperationConfiguration {version:number;enabled:boolean;intervalMinutes:number;codeEnabled:boolean;codeHour:number;codeMinute?:number;codeDays?:number[];codeWithAi:boolean;model:string|null;reasoningEffort:string|null;consent:boolean;maxFiles:number}
interface ConfigurationRow {project_id:string;version:number;enabled:boolean;interval_minutes:number;code_enabled:boolean;code_hour:number;code_minute:number;code_days:number[];code_with_ai:boolean;model:string|null;reasoning_effort:string|null;consent:boolean;max_files:number;changed_by:string;auth_version:number}
const view=(row:ConfigurationRow):OperationConfiguration=>({version:row.version,enabled:row.enabled,intervalMinutes:row.interval_minutes,codeEnabled:row.code_enabled,codeHour:row.code_hour,codeMinute:row.code_minute,codeDays:row.code_days,codeWithAi:row.code_with_ai,model:row.model,reasoningEffort:row.reasoning_effort,consent:row.consent,maxFiles:row.max_files});
export const initialOperations:OperationConfiguration={version:0,enabled:false,intervalMinutes:60,codeEnabled:false,codeHour:18,codeMinute:0,codeDays:[0,1,2,3,4,5,6],codeWithAi:false,model:null,reasoningEffort:null,consent:false,maxFiles:64};
export function nextDaily(now:Date,hour:number,minute=0,days:number[]=[0,1,2,3,4,5,6]) {
  for(let offset=0;offset<=7;offset++){
    const local=new Date(now.getTime()-5*3600000);local.setUTCDate(local.getUTCDate()+offset);
    if(!days.includes(local.getUTCDay()))continue;
    local.setUTCHours(hour,minute,0,0);const candidate=new Date(local.getTime()+5*3600000);
    if(candidate>now)return candidate;
  }
  throw new OperationError('INVALID_REQUEST');
}
export function occurrenceKey(projectId:string,version:number,kind:string,instant:Date,batch='') {
  const hash=createHash('sha256').update(`${projectId}:${version}:${kind}:${instant.toISOString()}:${batch}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export class OperationService {
  constructor(readonly database:TrelloDatabase,private options:SupervisionOptions,private codeReview:CodeReviewService){}
  async overview(projectId:string) {
    const row=(await this.database.query<ConfigurationRow>('SELECT * FROM operation_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];
    const cursor=(await this.database.query('SELECT next_sync,next_code,last_error,updated_at FROM operation_cursors WHERE project_id=$1',[projectId])).rows[0]??null;
    const runs=(await this.database.query('SELECT id,configuration_version,kind,occurrence,status,detail,started_at,finished_at FROM operation_runs WHERE project_id=$1 ORDER BY started_at DESC,id DESC LIMIT 30',[projectId])).rows;
    return {configuration:row?view(row):initialOperations,cursor,runs,timeZone:'America/Guayaquil',writesEnabled:false};
  }
  async configure(projectId:string,actor:AuthUser,values:Omit<OperationConfiguration,'version'>&{expectedVersion:number}) {
    if(!Number.isInteger(values.intervalMinutes)||values.intervalMinutes<5||values.intervalMinutes>10080||!Number.isInteger(values.codeHour)||values.codeHour<0||values.codeHour>23||!Number.isInteger(values.maxFiles)||values.maxFiles<1||values.maxFiles>100||values.codeWithAi&&(!values.consent||!values.model)||values.model&& !/^[a-zA-Z0-9._/:-]{1,100}$/.test(values.model)||values.reasoningEffort&&!['low','medium','high','xhigh','max'].includes(values.reasoningEffort))throw new OperationError('INVALID_REQUEST');
    const codeMinute=values.codeMinute??0,codeDays=values.codeDays??[0,1,2,3,4,5,6];
    if(!Number.isInteger(codeMinute)||codeMinute<0||codeMinute>59||!Array.isArray(codeDays)||!codeDays.length||codeDays.length>7||new Set(codeDays).size!==codeDays.length||codeDays.some(day=>!Number.isInteger(day)||day<0||day>6))throw new OperationError('INVALID_REQUEST');
    if(values.codeWithAi)await this.codeReview.validateScheduledProvider({projectId,userId:actor.id,authVersion:actor.auth_version,sessionId:'scheduled:'+projectId},values.model!,values.reasoningEffort as 'medium'|null);
    const client=await this.database.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['operations:'+projectId]);await assertManager(client,projectId,actor);
      const previous=(await client.query<ConfigurationRow>('SELECT * FROM operation_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];if((previous?.version??0)!==values.expectedVersion)throw new OperationError('CONFLICT');
      const version=(previous?.version??0)+1;
      await client.query('INSERT INTO operation_configurations(project_id,version,enabled,interval_minutes,code_enabled,code_hour,code_with_ai,model,reasoning_effort,consent,max_files,changed_by,auth_version,code_minute,code_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[projectId,version,values.enabled,values.intervalMinutes,values.codeEnabled,values.codeHour,values.codeWithAi,values.model,values.reasoningEffort,values.consent,values.maxFiles,actor.id,actor.auth_version,codeMinute,codeDays]);
      const now=new Date();await client.query(`INSERT INTO operation_cursors(project_id,configuration_version,next_sync,next_code) VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO UPDATE SET configuration_version=$2,next_sync=$3,next_code=$4,lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=clock_timestamp()`,[projectId,version,values.enabled?now:null,values.codeEnabled?nextDaily(now,values.codeHour,codeMinute,codeDays):null]);
      await client.query('INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,\'user\',$2,\'operations.configure\',\'operation_configuration\',$3,\'succeeded\')',[projectId,actor.id,`${projectId}:v${version}`]);await client.query('COMMIT');return this.overview(projectId);
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async tick(now=new Date()) {
    const claimed=(await this.database.query<ConfigurationRow&{next_sync:Date|null;next_code:Date|null;code_inventory:Record<string,string>;lease_token:string}>(`
      WITH candidate AS (SELECT project_id FROM operation_cursors WHERE (lease_until IS NULL OR lease_until<clock_timestamp()) AND (next_sync<=$1 OR next_code<=$1) ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1), claimed AS (
        UPDATE operation_cursors c SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '15 minutes' FROM candidate a WHERE c.project_id=a.project_id RETURNING c.*)
      SELECT f.*,c.next_sync,c.next_code,c.code_inventory,c.lease_token FROM claimed c JOIN operation_configurations f ON f.project_id=c.project_id AND f.version=c.configuration_version`,[now])).rows[0];
    if(!claimed)return false;
    const projectId=claimed.project_id,token=claimed.lease_token;
    let failed=false,currentKind:'sources'|'code'='sources';
    try{
      await assertManager(this.database,projectId,{id:claimed.changed_by,auth_version:claimed.auth_version});
      const actor=(await this.database.query<AuthUser>('SELECT * FROM users WHERE id=$1',[claimed.changed_by])).rows[0]!;
      if(claimed.next_sync&&claimed.next_sync<=now){
        const key=occurrenceKey(projectId,claimed.version,'sources',claimed.next_sync);
        const job=await enqueueJob(this.database,projectId,actor,'full',key);
        await this.database.query(`INSERT INTO operation_runs(project_id,configuration_version,kind,occurrence,status,detail,finished_at) VALUES($1,$2,'sources',$3,'succeeded',$4,clock_timestamp()) ON CONFLICT DO NOTHING`,[projectId,claimed.version,claimed.next_sync,JSON.stringify({jobId:job.id,result:'queued',coalesced:true})]);
        await this.database.query('UPDATE operation_cursors SET next_sync=$3,last_error=NULL WHERE project_id=$1 AND lease_token=$2',[projectId,token,new Date(now.getTime()+claimed.interval_minutes*60_000)]);
      }
      if(claimed.next_code&&claimed.next_code<=now){currentKind='code';await this.reviewCode(claimed,actor,now);}
    }catch(error){
      failed=true;
      const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'?error.code:'OPERATION_UNAVAILABLE';
      const failures=(await this.database.query<{count:string}>("SELECT count(*)::text AS count FROM operation_runs WHERE project_id=$1 AND configuration_version=$2 AND kind=$3 AND status='failed'",[projectId,claimed.version,currentKind])).rows[0];
      const pause=code==='FORBIDDEN'||['USAGE_LIMIT','CONNECTION_REQUIRED','AUTHORIZATION_EXPIRED','UNSUPPORTED_EFFORT','CODE_ANALYSIS_FAILED'].includes(code)||code!=='CODE_ANALYSIS_PENDING'&&Number(failures?.count??0)>=2;
      await this.database.query(`UPDATE operation_cursors SET last_error=$3,next_sync=CASE WHEN $3='FORBIDDEN' OR ($5 AND $6='sources') THEN NULL ELSE next_sync END,next_code=CASE WHEN $3='FORBIDDEN' OR ($5 AND $6='code') THEN NULL ELSE next_code END,lease_until=$4::timestamptz+interval '15 minutes' WHERE project_id=$1 AND lease_token=$2`,[projectId,token,code,now,pause,currentKind]);
      await this.database.query(`INSERT INTO operation_runs(project_id,configuration_version,kind,occurrence,status,detail,finished_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()) ON CONFLICT DO NOTHING`,[projectId,claimed.version,currentKind,now,pause?'suspended':code==='CODE_ANALYSIS_PENDING'?'started':'failed',JSON.stringify({errorCode:code,scheduledOccurrence:currentKind==='code'?claimed.next_code:claimed.next_sync,retryAfterMinutes:pause?null:15})]);
    }finally{await this.database.query('UPDATE operation_cursors SET lease_token=NULL,lease_until=CASE WHEN $3 THEN lease_until ELSE NULL END,updated_at=clock_timestamp() WHERE project_id=$1 AND lease_token=$2',[projectId,token,failed]);}
    return true;
  }
  private async reviewCode(row:ConfigurationRow&{next_code:Date|null;code_inventory:Record<string,string>;lease_token:string},actor:AuthUser,now:Date) {
    const connection=(await this.database.query<{owner:string;repository:string;branch:string}>('SELECT owner,repository,branch FROM github_connections WHERE project_id=$1',[row.project_id])).rows[0];if(!connection)throw new OperationError('NOT_CONFIGURED');
    const catalog=await readCodeCatalog(connection,this.options.githubToken,this.options.fetcher??fetch);
    const progress=(await this.database.query<{detail:{analyses:string[];reviewed:string[];exclusions?:{path:string;blobSha:string;reason:string}[];singleFileMode?:boolean}}>('SELECT detail FROM operation_runs WHERE project_id=$1 AND configuration_version=$2 AND kind=\'code\' AND occurrence=$3',[row.project_id,row.version,row.next_code])).rows[0]?.detail??{analyses:[],reviewed:[]};
    const exclusions=[...(progress.exclusions??[])],changed=catalog.files.filter(file=>row.code_inventory[file.path]!==file.blobSha);
    const remaining=changed.filter(file=>!exclusions.some(value=>value.path===file.path&&value.blobSha===file.blobSha));
    const selected=remaining.slice(0,Math.max(0,row.max_files-progress.reviewed.length-exclusions.length)),completed:Record<string,string>={...row.code_inventory},analyses:string[]=[...progress.analyses],reviewed=[...progress.reviewed];
    let singleFileMode=progress.singleFileMode??false;
    const detail=()=>JSON.stringify({head:catalog.head,analyses,reviewed,exclusions,singleFileMode,withAi:row.code_with_ai});
    await this.database.query(`INSERT INTO operation_runs(project_id,configuration_version,kind,occurrence,status,detail) VALUES($1,$2,'code',$3,'started',$4) ON CONFLICT DO NOTHING`,[row.project_id,row.version,row.next_code,detail()]);
    const saveProgress=async()=>{
      const client=await this.database.connect();try{await client.query('BEGIN');await assertManager(client,row.project_id,actor);
        const saved=await client.query('UPDATE operation_cursors SET code_inventory=$3 WHERE project_id=$1 AND lease_token=$2 AND configuration_version=$4 AND lease_until>clock_timestamp() RETURNING project_id',[row.project_id,row.lease_token,JSON.stringify(completed),row.version]);if(!saved.rowCount)throw new OperationError('CONFLICT');
        await client.query('UPDATE operation_runs SET detail=$4 WHERE project_id=$1 AND configuration_version=$2 AND kind=\'code\' AND occurrence=$3',[row.project_id,row.version,row.next_code,detail()]);await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    };
    for(let index=0;index<selected.length;){
      await assertManager(this.database,row.project_id,actor);
      const stillCurrent=(await this.database.query('SELECT project_id FROM operation_cursors WHERE project_id=$1 AND configuration_version=$2 AND lease_token=$3 AND lease_until>clock_timestamp()',[row.project_id,row.version,row.lease_token])).rows.length;if(!stillCurrent)throw new OperationError('CONFLICT');
      const batch=selected.slice(index,index+(singleFileMode?1:4));
      let analysis:{id:string};
      try{
        analysis=await this.codeReview.analyze({projectId:row.project_id,userId:actor.id,authVersion:actor.auth_version,sessionId:'scheduled:'+row.project_id},actor,{paths:batch.map(file=>file.path),expectedHead:catalog.head,mode:'files',withAi:row.code_with_ai,consent:row.consent,...(row.model?{model:row.model}:{}),...(row.reasoning_effort?{reasoningEffort:row.reasoning_effort as 'medium'}:{}),requestKey:occurrenceKey(row.project_id,row.version,'code',row.next_code!,catalog.head+':'+batch.map(file=>file.path+':'+file.blobSha).join('|'))});
      }catch(error){
        if(!(error&&typeof error==='object'&&'code' in error&&error.code==='SENSITIVE_SOURCE'))throw error;
        // Keep the fallback mode across retries so a pending single-file request is reused.
        if(batch.length>1){singleFileMode=true;await saveProgress();continue;}
        exclusions.push({path:batch[0]!.path,blobSha:batch[0]!.blobSha,reason:'sensitive_source'});
        await saveProgress();index++;continue;
      }
      // A running AI analysis is not coverage. Retry the same idempotent request after it completes.
      const outcome=await this.codeReview.analysis(row.project_id,analysis.id);if(outcome?.status!=='ready')throw new OperationError(outcome?.status==='failed'?'CODE_ANALYSIS_FAILED':'CODE_ANALYSIS_PENDING');
      analyses.push(analysis.id);for(const file of batch){completed[file.path]=file.blobSha;reviewed.push(file.path);}
      await saveProgress();index+=batch.length;
    }
    const eligible=new Set(catalog.files.map(file=>file.path)),omitted=[...catalog.inventory.filter(file=>!eligible.has(file.path)).map(file=>({path:file.path,reason:'unsupported_or_exceeds_source_limits'})),...exclusions.map(({path,reason})=>({path,reason}))];
    await this.database.query(`UPDATE operation_runs SET status=$4,detail=$5,finished_at=clock_timestamp() WHERE project_id=$1 AND configuration_version=$2 AND kind='code' AND occurrence=$3`,[row.project_id,row.version,row.next_code,remaining.length>selected.length?'partial':'succeeded',JSON.stringify({head:catalog.head,analyses,reviewed,exclusions,singleFileMode,deferred:remaining.slice(selected.length).map(file=>file.path),omitted,withAi:row.code_with_ai})]);
    await this.database.query('UPDATE operation_cursors SET code_inventory=$3,next_code=$4,last_error=NULL WHERE project_id=$1 AND lease_token=$2',[row.project_id,row.lease_token,JSON.stringify(completed),nextDaily(now,row.code_hour,row.code_minute,row.code_days)]);
  }
}
export function startOperationWorker(service:OperationService,onError:()=>void){let stopped=false,pending:Promise<unknown>|null=null;const tick=()=>{if(stopped||pending)return;pending=service.tick().catch(onError).finally(()=>{pending=null;});};const timer=setInterval(tick,10_000);tick();return {close:async()=>{stopped=true;clearInterval(timer);await pending;}};}
