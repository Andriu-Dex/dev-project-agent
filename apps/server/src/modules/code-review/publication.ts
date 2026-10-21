import type {ReasoningEffort} from '@dev-project-agent/contracts';
import type {ConnectionBinding} from '../../providers/chatgpt/connection.js';
import {githubApi} from '../../integrations/github/code-client.js';
import {safeText} from '../proposals/contracts.js';
import type pg from 'pg';
import type {CodeCandidate,CodePublicationView,CodeSource} from '@dev-project-agent/contracts';
import type {AuthDatabase,AuthUser} from '../auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {CodeReviewService} from './service.js';
import {fingerprint} from '../proposals/contracts.js';
import {assertManager} from '../supervision/access.js';
import {PublicationError,publicationRemote,type PublicationPlan} from '../../integrations/github/publication-client.js';
import {parseCodeVerdict} from './evidence.js';
interface Job {id:string;project_id:string;proposal_id:string;version:number;content_hash:string;requested_by:string;auth_version:number;approval_id:string;plan:PublicationPlan;status:CodePublicationView['status'];error_code:string|null;write_started_at:Date|null;created_at:Date;finished_at:Date|null;commit_sha:string|null;pull_number:number|null;pull_url:string|null}
export async function publicationOverview(database:AuthDatabase,projectId:string):Promise<CodePublicationView[]> {
  const rows=(await database.query<Job>('SELECT * FROM github_publication_jobs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[projectId])).rows;
  return Promise.all(rows.map(async row=>({id:row.id,proposalId:row.proposal_id,version:row.version,status:row.status,errorCode:row.error_code,branch:row.plan.branch,commitSha:row.commit_sha,pullNumber:row.pull_number,pullUrl:row.pull_url,createdAt:row.created_at.toISOString(),finishedAt:row.finished_at?.toISOString()??null,integrationStatus:row.status==='succeeded'?'pending_human' as const:'not_requested' as const,plan:row.plan,events:(await database.query<{stage:string;outcome:string;created_at:Date}>('SELECT stage,outcome,created_at FROM github_publication_events WHERE project_id=$1 AND job_id=$2 ORDER BY created_at,id',[projectId,row.id])).rows.map(event=>({stage:event.stage,outcome:event.outcome,errorCode:null,createdAt:event.created_at.toISOString()}))})));
}
export class PublicationService {
  private tasks=new Set<Promise<void>>();private closed=false;
  constructor(readonly database:TrelloDatabase,private code:CodeReviewService,readonly configuration:{enabled:boolean;token:string|null},private fetcher:typeof fetch=fetch,private onFailure:()=>void=()=>{}){}
  private async transaction<T>(operation:(client:pg.PoolClient)=>Promise<T>){const client=await this.database.connect();try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  private async event(database:AuthDatabase,job:Job,stage:string,outcome:string,detail:Record<string,unknown>={},actor?:AuthUser){await database.query('INSERT INTO github_publication_events(project_id,job_id,stage,outcome,detail) VALUES($1,$2,$3,$4,$5)',[job.project_id,job.id,stage,outcome,JSON.stringify({...detail,actorId:actor?.id??null,actorType:actor?'user':'system'})]);await database.query('INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,$2,$3,$4,\'github_publication\',$5,$6)',[job.project_id,actor?'user':'system',actor?.id??null,'code.publication.'+stage,job.id,outcome]);}
  async initialize(){await this.transaction(async client=>{const rows=(await client.query<Job>("SELECT * FROM github_publication_jobs WHERE status IN ('queued','running') FOR UPDATE")).rows;for(const row of rows)await this.finish(client,row,row.write_started_at?'reconciliation_required':'failed','SERVICE_RESTARTED');});}
  private async validate(database:AuthDatabase,projectId:string,id:string,version:number,hash:string,actor:Pick<AuthUser,'id'|'auth_version'>,states:string[]){
    await assertManager(database,projectId,actor);
    const row=(await database.query<{purpose:string;state:string;latest_version:number;analysis_id:string;goal:string;finding_ids:string[];candidate:CodeCandidate;content_hash:string}>(`SELECT p.purpose,p.latest_version,v.*,c.candidate,c.content_hash FROM code_proposals p JOIN code_versions v ON v.project_id=p.project_id AND v.proposal_id=p.id JOIN code_candidates c ON c.project_id=v.project_id AND c.proposal_id=v.proposal_id AND c.version=v.version WHERE p.project_id=$1 AND p.id=$2 AND v.version=$3`,[projectId,id,version])).rows[0];
    if(!row)throw new PublicationError('NOT_FOUND');if(row.purpose!=='live')throw new PublicationError('DEMONSTRATION_ONLY');if(row.latest_version!==version||!states.includes(row.state)||row.content_hash!==hash||!row.candidate)throw new PublicationError('CONFLICT');
    const analysis=(await database.query<{source:CodeSource}>('SELECT source FROM code_sources WHERE project_id=$1 AND analysis_id=$2',[projectId,row.analysis_id])).rows[0];if(!analysis)throw new PublicationError('NO_SOURCE');
    if(fingerprint({schemaVersion:1,source:analysis.source,goal:row.goal,findingIds:row.finding_ids,candidate:row.candidate})!==hash||row.candidate.checks.some(check=>check.status==='fail')||row.candidate.correction.unresolvedQuestions.length)throw new PublicationError('HASH_MISMATCH');
    const connection=(await database.query<{owner:string;repository:string;branch:string}>('SELECT owner,repository,branch FROM github_connections WHERE project_id=$1',[projectId])).rows[0];if(fingerprint(connection)!==fingerprint(analysis.source.connection))throw new PublicationError('SOURCE_CHANGED');
    const approval=(await database.query<{id:string;actor_id:string;auth_version:number}>('SELECT id,actor_id,auth_version FROM code_decisions WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND content_hash=$4 AND decision=\'approved\'',[projectId,id,version,hash])).rows[0];if(!approval)throw new PublicationError('MISSING_APPROVAL');await assertManager(database,projectId,{id:approval.actor_id,auth_version:approval.auth_version});
    const messages=(await database.query<{stage:'reviewer'|'approver';output:unknown}>("SELECT stage,output FROM code_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND status='succeeded' AND stage IN ('reviewer','approver')",[projectId,id,version])).rows;
    for(const stage of ['reviewer','approver'] as const){const message=messages.find(message=>message.stage===stage);if(!message||parseCodeVerdict(message.output,stage,hash,row.candidate).verdict!==(stage==='reviewer'?'validated':'human_required'))throw new PublicationError('MISSING_REVIEW');}
    return {source:analysis.source,candidate:row.candidate,approval};
  }
  async request(projectId:string,actor:AuthUser,id:string,version:number,hash:string,key:string,confirmed:boolean){
    if(!confirmed)throw new PublicationError('CONFIRMATION_REQUIRED');if(this.closed||!this.configuration.enabled||!this.configuration.token)throw new PublicationError('WRITES_DISABLED');
    let created=false;const job=await this.transaction(async client=>{await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['code:'+projectId]);await assertManager(client,projectId,actor);
      const previous=(await client.query<Job>('SELECT * FROM github_publication_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[projectId,actor.id,key])).rows[0];if(previous){if(previous.proposal_id!==id||previous.version!==version||previous.content_hash!==hash)throw new PublicationError('CONFLICT');return previous;}
      const value=await this.validate(client,projectId,id,version,hash,actor,['authorized']);
      if((await client.query("SELECT id FROM github_publication_jobs WHERE project_id=$1 AND (status IN ('queued','running','reconciliation_required') OR (proposal_id=$2 AND version=$3))",[projectId,id,version])).rows.length)throw new PublicationError('CONFLICT');
      const plan:PublicationPlan={repository:value.source.connection.owner+'/'+value.source.connection.repository,baseBranch:value.source.connection.branch,baseSha:value.source.head,branch:`agent/${id}-v${version}`,contentHash:hash,title:`fix: apply reviewed proposal ${id} v${version}`,body:`Proposal: ${id}\nVersion: ${version}\nContent hash: ${hash}\nBase commit: ${value.source.head}\n\nThe human manager approved only this bounded patch. Project builds and tests have not been executed by this service. Review and integration into develop and main remain human decisions.`,files:value.candidate.files.map(file=>({path:file.path,beforeBlob:value.source.files.find(original=>original.path===file.path)!.blobSha,afterBlob:file.blobSha}))};
      if(value.candidate.documentation)plan.body+='\n\n'+value.candidate.documentation;
      if(plan.baseBranch!=='develop')throw new PublicationError('INVALID_DESTINATION');
      const saved=(await client.query<Job>('INSERT INTO github_publication_jobs(project_id,proposal_id,version,content_hash,requested_by,auth_version,request_key,approval_id,plan) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[projectId,id,version,hash,actor.id,actor.auth_version,key,value.approval.id,JSON.stringify(plan)])).rows[0]!;
      await client.query("UPDATE code_versions SET state='executing' WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[projectId,id,version]);await this.event(client,saved,'request','requested',{},actor);created=true;return saved;
    });if(created){const task=this.run(job).catch(this.onFailure);this.tasks.add(task);void task.then(()=>this.tasks.delete(task));}return {id:job.id};
  }
  private async finish(database:AuthDatabase,job:Job,status:'succeeded'|'failed'|'reconciliation_required',errorCode:string|null,verified?:{commitSha:string;pullNumber:number;pullUrl:string}){
    const saved=await database.query("UPDATE github_publication_jobs SET status=$2,error_code=$3,finished_at=clock_timestamp(),commit_sha=COALESCE($4,commit_sha),pull_number=COALESCE($5,pull_number),pull_url=COALESCE($6,pull_url) WHERE id=$1 AND status IN ('queued','running','reconciliation_required') RETURNING id",[job.id,status,errorCode,verified?.commitSha??null,verified?.pullNumber??null,verified?.pullUrl??null]);if(!saved.rowCount)throw new PublicationError('CONFLICT');
    await database.query('UPDATE code_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[job.project_id,job.proposal_id,job.version,status==='succeeded'?'executed':status==='failed'?'execution_failed':'reconciliation_required']);await this.event(database,job,status==='succeeded'?'verified':'result',status,{errorCode,...verified});
  }
  private async run(job:Job){let writeStarted=false;try{
    const actor={id:job.requested_by,auth_version:job.auth_version},remote=publicationRemote(this.configuration.token!,this.fetcher);
    const active=await this.database.query("UPDATE github_publication_jobs SET status='running' WHERE id=$1 AND status='queued' RETURNING id",[job.id]);if(!active.rowCount)throw new PublicationError('CONFLICT');
    const value=await this.validate(this.database,job.project_id,job.proposal_id,job.version,job.content_hash,actor,['executing']);await remote.preflight(value.source,job.plan);
    const beforeWrite=async()=>{if(this.closed)throw new PublicationError('SERVICE_STOPPED');await remote.assertBase(value.source,job.plan);await this.validate(this.database,job.project_id,job.proposal_id,job.version,job.content_hash,actor,['executing']);};
    await this.transaction(async client=>{await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['code:'+job.project_id]);await this.validate(client,job.project_id,job.proposal_id,job.version,job.content_hash,actor,['executing']);await client.query('UPDATE github_publication_jobs SET write_started_at=clock_timestamp() WHERE id=$1 AND status=\'running\'',[job.id]);await this.event(client,job,'write','started');});writeStarted=true;
    const verified=await remote.publish(value.source,value.candidate,job.plan,beforeWrite);await this.transaction(client=>this.finish(client,job,'succeeded',null,verified));
  }catch(error){if((await this.database.query("SELECT id FROM github_publication_jobs WHERE id=$1 AND status='failed' AND error_code='AUTHORIZATION_WITHDRAWN'",[job.id])).rowCount)return;const code=error&&typeof error==='object'&&'code' in error?String(error.code):'PUBLICATION_FAILED';await this.transaction(client=>this.finish(client,job,writeStarted?'reconciliation_required':'failed',code));}}
  async reconcile(projectId:string,actor:AuthUser,id:string){await assertManager(this.database,projectId,actor);const job=(await this.database.query<Job>('SELECT * FROM github_publication_jobs WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];if(!job||job.status!=='reconciliation_required'||!this.configuration.token)throw new PublicationError('CONFLICT');
    await this.transaction(async client=>{await this.validate(client,projectId,job.proposal_id,job.version,job.content_hash,actor,['reconciliation_required']);await this.event(client,job,'reconciliation','requested',{},actor);});
    const value=await this.validate(this.database,projectId,job.proposal_id,job.version,job.content_hash,actor,['reconciliation_required']),result=await publicationRemote(this.configuration.token,this.fetcher).verify(value.source,value.candidate,job.plan);if(!result)return {verified:false,message:'No se confirmó rama y PR. La reconciliación sigue pendiente; no se ha repetido ninguna escritura.'};await this.transaction(async client=>{await this.validate(client,projectId,job.proposal_id,job.version,job.content_hash,actor,['reconciliation_required']);await this.finish(client,job,'succeeded',null,result);});return {verified:true};}
  private async recoveryEvent(projectId:string,id:string,actor:AuthUser,action:string,reason:string){
    await this.database.query('INSERT INTO github_recovery_events(project_id,recovery_id,actor_id,action,reason) VALUES($1,$2,$3,$4,$5)',[projectId,id,actor.id,action,reason]);
    await this.database.query("INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,'user',$2,$3,'github_recovery',$4,$5)",[projectId,actor.id,'github.recovery.'+action,id,action==='uncertain'?'failed':'succeeded']);
  }
  async recoveries(projectId:string){return (await this.database.query('SELECT id,publication_id,plan,content_hash,status,reason,created_at FROM github_recovery_requests WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',[projectId])).rows;}
  async prepareRecovery(binding:ConnectionBinding,actor:AuthUser,publicationId:string,reason:string,key:string,model:string,effort:ReasoningEffort|null,consent:boolean){
    await assertManager(this.database,binding.projectId,actor);safeText(reason);if(!reason.trim())throw new PublicationError('REASON_REQUIRED');
    const previous=(await this.database.query('SELECT id,publication_id,reason,content_hash,status,plan FROM github_recovery_requests WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,key])).rows[0];if(previous){if(previous.publication_id!==publicationId||previous.reason!==reason)throw new PublicationError('CONFLICT');return previous;}
    const job=(await this.database.query<Job>("SELECT * FROM github_publication_jobs WHERE project_id=$1 AND id=$2 AND status='succeeded'",[binding.projectId,publicationId])).rows[0];if(!job?.pull_number||!job.commit_sha)throw new PublicationError('NOT_FOUND');
    const proposal=await this.code.version(binding.projectId,job.proposal_id,job.version),analysis=await this.code.analysis(binding.projectId,proposal.analysisId);if(!analysis?.source)throw new PublicationError('NO_SOURCE');
    const configured=(await this.database.query('SELECT owner,repository,branch FROM github_connections WHERE project_id=$1',[binding.projectId])).rows[0];if(fingerprint(configured)!==fingerprint(analysis.source.connection))throw new PublicationError('SOURCE_CHANGED');
    const connection=analysis.source.connection,pull=await githubApi(connection,this.configuration.token??this.code.token,this.fetcher).get('/pulls/'+job.pull_number) as {state:string;merged_at:string|null;head:{sha:string;repo:{full_name:string}};base:{ref:string;repo:{full_name:string}}};
    if(pull.head?.sha!==job.commit_sha||pull.head.repo.full_name!==job.plan.repository||pull.base?.repo?.full_name!==job.plan.repository||pull.base.ref!==job.plan.baseBranch)throw new PublicationError('SOURCE_CHANGED');
    if(pull.merged_at)return {kind:'code_proposal',...await this.code.prepareReversal(binding,actor,publicationId,reason,model,effort,consent,key)};
    if(pull.state!=='open')throw new PublicationError('CONFLICT');
    const plan={action:'close_pr',publicationId,connection,pullNumber:job.pull_number,pullUrl:job.pull_url,head:job.commit_sha,repository:job.plan.repository,reason,review:'Identidad, rama y HEAD coinciden con la publicación verificada. Solo se cerrará el PR; rama y commits se conservan.',policy:'Requiere decisión humana y confirmación de ejecución separadas. No se realizará merge.'};
    const hash=fingerprint(plan);const result=(await this.database.query('INSERT INTO github_recovery_requests(project_id,publication_id,requested_by,auth_version,request_key,reason,plan,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,plan,content_hash',[binding.projectId,publicationId,actor.id,actor.auth_version,key,reason,JSON.stringify(plan),hash])).rows[0];await this.recoveryEvent(binding.projectId,result.id,actor,'prepared',reason);return result;
  }
  async recoveryAction(projectId:string,actor:AuthUser,id:string,hash:string,action:'approve'|'execute'|'reconcile',reason:string,confirmed:boolean){
    await assertManager(this.database,projectId,actor);safeText(reason);if(!reason.trim()||!confirmed)throw new PublicationError('CONFIRMATION_REQUIRED');
    const saved=(await this.database.query('SELECT * FROM github_recovery_requests WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];
    if(!saved||saved.requested_by!==actor.id||saved.auth_version!==actor.auth_version||saved.content_hash!==hash||fingerprint(saved.plan)!==hash)throw new PublicationError('CONFLICT');
    if(action==='approve'){
      const updated=await this.database.query("UPDATE github_recovery_requests SET status='approved' WHERE project_id=$1 AND id=$2 AND status='prepared'",[projectId,id]);if(!updated.rowCount)throw new PublicationError('CONFLICT');await this.recoveryEvent(projectId,id,actor,'approved',reason);return {status:'approved'};
    }
    if(!this.configuration.token)throw new PublicationError('WRITES_DISABLED');
    const configured=(await this.database.query('SELECT owner,repository,branch FROM github_connections WHERE project_id=$1',[projectId])).rows[0];if(fingerprint(configured)!==fingerprint(saved.plan.connection))throw new PublicationError('SOURCE_CHANGED');
    const plan=saved.plan,api=githubApi(plan.connection,this.configuration.token,this.fetcher),path='/pulls/'+Number(plan.pullNumber);
    const read=async()=>{const pull=await api.get(path) as {state:string;merged_at:string|null;head:{sha:string;repo:{full_name:string}};base:{ref:string;repo:{full_name:string}}};if(pull.merged_at||pull.head?.sha!==plan.head||pull.head.repo.full_name!==plan.repository||pull.base?.repo?.full_name!==plan.repository||pull.base.ref!==plan.connection.branch)throw new PublicationError('SOURCE_CHANGED');return pull;};
    if(action==='reconcile'){
      if(!['running','reconciliation_required'].includes(saved.status))throw new PublicationError('CONFLICT');const pull=await read();if(pull.state!=='closed')return {status:'reconciliation_required'};await this.database.query("UPDATE github_recovery_requests SET status='succeeded' WHERE project_id=$1 AND id=$2 AND status IN ('running','reconciliation_required')",[projectId,id]);await this.recoveryEvent(projectId,id,actor,'verified',reason);return {status:'succeeded'};
    }
    if(!this.configuration.enabled)throw new PublicationError('WRITES_DISABLED');
    if(saved.status!=='approved'||(await read()).state!=='open')throw new PublicationError('CONFLICT');
    await assertManager(this.database,projectId,actor);
    const claimed=await this.database.query("UPDATE github_recovery_requests SET status='running' WHERE project_id=$1 AND id=$2 AND status='approved'",[projectId,id]);if(!claimed.rowCount)throw new PublicationError('CONFLICT');
    await this.recoveryEvent(projectId,id,actor,'write_started',reason);
    try{
      const response=await this.fetcher(`https://api.github.com/repos/${plan.connection.owner}/${plan.connection.repository}${path}`,{method:'PATCH',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+this.configuration.token,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({state:'closed'})});
      if(!response.ok||(await read()).state!=='closed')throw new PublicationError('REMOTE_UNCONFIRMED');
      await this.database.query("UPDATE github_recovery_requests SET status='succeeded' WHERE project_id=$1 AND id=$2 AND status='running'",[projectId,id]);await this.recoveryEvent(projectId,id,actor,'verified',reason);return {status:'succeeded'};
    }catch{await this.database.query("UPDATE github_recovery_requests SET status='reconciliation_required' WHERE project_id=$1 AND id=$2 AND status='running'",[projectId,id]);await this.recoveryEvent(projectId,id,actor,'uncertain',reason);return {status:'reconciliation_required'};}
  }
  async close(){this.closed=true;await this.waitForIdle();}async waitForIdle(){while(this.tasks.size)await Promise.allSettled([...this.tasks]);}
}
