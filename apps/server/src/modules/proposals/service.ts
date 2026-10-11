import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import type {AgentJobView,AgentStage,ProposalContent,ProposalState,ProposalVersionView,ReasoningEffort,TrelloItem,TrelloSnapshot} from '@dev-project-agent/contracts';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {AuthDatabase,AuthUser} from '../auth/repository.js';
import {assertManager} from '../supervision/access.js';
import {ChatGPTService,providerCode} from '../../providers/chatgpt/service.js';
import type {ConnectionBinding} from '../../providers/chatgpt/connection.js';
import {supportedEfforts} from '../../providers/chatgpt/validation.js';
import {assertTargetDate,fingerprint,instructions,parseContent,parseVerdict,ProposalError,safeText,type ProposalContext} from './contracts.js';

export interface ProposalRequest {sourceRunId:string;cardId:string;requestedDue:string;goal:string;model:string;reasoningEffort?:ReasoningEffort;requestKey:string;proposalId?:string;expectedVersion?:number}
interface VersionRow {project_id:string;proposal_id:string;version:number;state:ProposalState;source_run_id:string;context:ProposalContext;goal:string;requested_due:Date;created_at:Date;content:ProposalContent|null;content_hash:string|null}
interface JobRow {id:string;project_id:string;proposal_id:string;version:number;model:string;reasoning_effort:ReasoningEffort|null;status:AgentJobView['status'];error_code:string|null;created_at:Date;request_hash:string}
const versionSelect='SELECT v.*,c.content,c.content_hash FROM proposal_versions v LEFT JOIN proposal_contents c USING (project_id,proposal_id,version)';
const jobView=(row:JobRow):AgentJobView=>({id:row.id,proposalId:row.proposal_id,version:row.version,model:row.model,reasoningEffort:row.reasoning_effort,status:row.status,errorCode:row.error_code,createdAt:row.created_at.toISOString()});
const sourceCard=(item:TrelloItem)=>({id:item.id,name:safeText(item.name),state:item.state,due:item.due,start:item.start,wbs:item.planning?.wbs??null});
const cardHash=(item:TrelloItem)=>fingerprint({card:sourceCard(item),dueComplete:item.dueComplete,archived:item.archived,kind:item.kind,memberIds:[...item.memberIds].sort(),dependencies:item.planning?.dependencies??null});
const code=(error:unknown)=>error instanceof ProposalError?error.code:providerCode(error);

export class ProposalService {
  private tasks=new Set<Promise<void>>();private closed=false;
  constructor(readonly database:TrelloDatabase,readonly provider:ChatGPTService,private readonly onFailure:()=>void=()=>{}) {}
  private async transaction<T>(operation:(client:pg.PoolClient)=>Promise<T>) {
    const client=await this.database.connect();try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private async audit(database:AuthDatabase,projectId:string,actorId:string|null,action:string,id:string,outcome:string) {
    await database.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,'proposal',$5,$6)",[projectId,actorId?'user':'system',actorId,action,id,outcome]);
  }
  async initialize() {
    await this.transaction(async client=>{
      const jobs=await client.query<JobRow>("UPDATE agent_jobs SET status='interrupted',finished_at=clock_timestamp(),error_code='SERVICE_RESTARTED' WHERE status='running' RETURNING *");
      for(const job of jobs.rows){await client.query("UPDATE proposal_versions SET state=CASE state WHEN 'in_review' THEN 'pending_review' WHEN 'in_policy_check' THEN 'pending_policy_check' ELSE state END WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[job.project_id,job.proposal_id,job.version]);await this.audit(client,job.project_id,null,'agent.recovery',job.id,'failed');}
    });
  }
  private async context(database:AuthDatabase,projectId:string,runId:string,cardId:string):Promise<ProposalContext> {
    const run=(await database.query<{trello_snapshot_id:string|null;policy_version:number;baseline_version:number|null}>('SELECT trello_snapshot_id,policy_version,baseline_version FROM supervision_runs WHERE project_id=$1 AND id=$2',[projectId,runId])).rows[0];
    if(!run?.trello_snapshot_id)throw new ProposalError('NO_SOURCE');
    const snapshot=(await database.query<{data:TrelloSnapshot;observed_at:Date}>('SELECT data,observed_at FROM trello_snapshots WHERE project_id=$1 AND id=$2',[projectId,run.trello_snapshot_id])).rows[0];
    const item=snapshot?.data.items.find(item=>item.id===cardId&&!item.archived&&item.kind!=='reference');if(!item)throw new ProposalError('NOT_FOUND');
    const card=sourceCard(item);
    return {schemaVersion:1,projectId,sourceRunId:runId,trelloSnapshotId:run.trello_snapshot_id,policyVersion:run.policy_version,baselineVersion:run.baseline_version,observedAt:snapshot!.observed_at.toISOString(),card,sourceFingerprint:cardHash(item),
      evidence:Object.entries(card).map(([field,value])=>({id:'card.'+field,field,value})),limitations:['Estado declarado; no acredita aceptación formal.','No se conoce causa del retraso ni duración real restante.','No se han enviado descripciones, perfiles, código ni credenciales.','La fecha solicitada es un objetivo del gestor, no una promesa de finalización.']};
  }
  private async current(database:AuthDatabase,context:ProposalContext):Promise<boolean> {
    const policy=(await database.query<{version:number;stale_after_minutes:number}>('SELECT version,stale_after_minutes FROM tracking_policy_versions WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[context.projectId])).rows[0];
    const baseline=(await database.query<{version:number}>('SELECT version FROM baseline_versions WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[context.projectId])).rows[0];
    const snapshot=(await database.query<{data:TrelloSnapshot;observed_at:Date}>('SELECT data,observed_at FROM trello_snapshots WHERE project_id=$1 ORDER BY imported_at DESC,id DESC LIMIT 1',[context.projectId])).rows[0];
    const item=snapshot?.data.items.find(item=>item.id===context.card.id);
    return Boolean(policy&&snapshot&&item&&policy.version===context.policyVersion&&(baseline?.version??null)===context.baselineVersion&&Date.now()-snapshot.observed_at.getTime()<=policy.stale_after_minutes*60_000&&Date.now()>=snapshot.observed_at.getTime()&&cardHash(item)===context.sourceFingerprint);
  }
  async overview(projectId:string) {
    const rows=await this.database.query<{id:string;version:number;state:ProposalState;goal:string;cardName:string;created_at:Date}>(`SELECT p.id,v.version,v.state,v.goal,v.context->'card'->>'name' AS "cardName",v.created_at FROM proposals p JOIN proposal_versions v ON v.project_id=p.project_id AND v.proposal_id=p.id AND v.version=p.latest_version WHERE p.project_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 30`,[projectId]);
    const jobs=await this.database.query<JobRow>('SELECT * FROM agent_jobs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[projectId]);
    return {proposals:rows.rows.map(row=>({id:row.id,version:row.version,state:row.state,goal:row.goal,cardName:row.cardName,createdAt:row.created_at.toISOString()})),jobs:jobs.rows.map(jobView)};
  }
  async version(projectId:string,proposalId:string,version:number):Promise<ProposalVersionView|null> {
    const row=(await this.database.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3',[projectId,proposalId,version])).rows[0];if(!row)return null;
    const messages=await this.database.query('SELECT id,job_id AS "jobId",stage,status,input,output,error_code AS "errorCode",duration_ms AS "durationMs",usage,created_at AS "createdAt" FROM agent_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 ORDER BY created_at,id',[projectId,proposalId,version]);
    const decisions=await this.database.query('SELECT id,actor_id AS "actorId",decision,reason,created_at AS "createdAt" FROM proposal_decisions WHERE project_id=$1 AND proposal_id=$2 AND version=$3 ORDER BY created_at,id',[projectId,proposalId,version]);
    return {proposalId,version,state:row.state,createdAt:row.created_at.toISOString(),goal:row.goal,requestedDue:row.requested_due.toISOString(),sourceRunId:row.source_run_id,context:row.context as unknown as ProposalVersionView['context'],content:row.content,contentHash:row.content_hash,messages:messages.rows.map(item=>({...item,createdAt:item.createdAt.toISOString()})) as ProposalVersionView['messages'],decisions:decisions.rows.map(item=>({...item,createdAt:item.createdAt.toISOString()})) as ProposalVersionView['decisions']};
  }
  private launch(binding:ConnectionBinding,actor:AuthUser,job:JobRow) {
    const task=this.pipeline(binding,actor,job).catch(()=>this.onFailure());this.tasks.add(task);void task.then(()=>this.tasks.delete(task));
  }
  async prepare(binding:ConnectionBinding,actor:AuthUser,request:ProposalRequest) {
    const effort=request.reasoningEffort??null,due=new Date(request.requestedDue);
    if(this.closed||!Number.isFinite(due.getTime())||due.getTime()<=Date.now())throw new ProposalError('INVALID_TARGET_DATE');
    safeText(request.goal);if(!request.goal.trim())throw new ProposalError('INVALID_REQUEST');
    const {requestKey:ignoredKey,...payload}=request;const hash=fingerprint({...payload,requestedDue:due.toISOString(),reasoningEffort:effort});
    let created=false;
    const job=await this.transaction(async client=>{
      await assertManager(client,binding.projectId,actor);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['agent:'+binding.projectId]);
      const previous=(await client.query<JobRow>('SELECT * FROM agent_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,request.requestKey])).rows[0];
      if(previous){if(previous.request_hash!==hash)throw new ProposalError('CONFLICT');return previous;}
      this.provider.connections.credentials(binding,request.model);if(effort&&!supportedEfforts(request.model).includes(effort))throw new ProposalError('UNSUPPORTED_EFFORT');
      if((await client.query("SELECT id FROM agent_jobs WHERE project_id=$1 AND status='running'",[binding.projectId])).rows.length)throw new ProposalError('CONFLICT');
      const context=await this.context(client,binding.projectId,request.sourceRunId,request.cardId);
      if(!await this.current(client,context))throw new ProposalError('SOURCE_CHANGED');
      assertTargetDate(due.toISOString(),context.card.start);
      if(context.card.due===due.toISOString())throw new ProposalError('NO_CHANGE');
      let proposalId=request.proposalId,version=1;
      if(proposalId){
        const latest=(await client.query<{latest_version:number;state:ProposalState}>('SELECT p.latest_version,v.state FROM proposals p JOIN proposal_versions v ON v.proposal_id=p.id AND v.project_id=p.project_id AND v.version=p.latest_version WHERE p.project_id=$1 AND p.id=$2 FOR UPDATE OF p,v',[binding.projectId,proposalId])).rows[0];
        if(!latest)throw new ProposalError('NOT_FOUND');if(latest.latest_version!==request.expectedVersion||!['changes_requested','invalidated'].includes(latest.state))throw new ProposalError('CONFLICT');
        version=latest.latest_version+1;await client.query('UPDATE proposals SET latest_version=$3 WHERE project_id=$1 AND id=$2',[binding.projectId,proposalId,version]);
      }else proposalId=(await client.query<{id:string}>('INSERT INTO proposals (project_id,created_by) VALUES ($1,$2) RETURNING id',[binding.projectId,actor.id])).rows[0]!.id;
      await client.query('INSERT INTO proposal_versions (project_id,proposal_id,version,source_run_id,context,goal,requested_due,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[binding.projectId,proposalId,version,request.sourceRunId,JSON.stringify(context),request.goal,due.toISOString(),actor.id]);
      const inserted=(await client.query<JobRow>('INSERT INTO agent_jobs (project_id,proposal_id,version,requested_by,request_key,request_hash,model,reasoning_effort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[binding.projectId,proposalId,version,actor.id,request.requestKey,hash,request.model,effort])).rows[0]!;
      await this.audit(client,binding.projectId,actor.id,'proposal.prepare',proposalId,'requested');created=true;return inserted;
    });
    if(created)this.launch(binding,actor,job);return jobView(job);
  }
  async resume(binding:ConnectionBinding,actor:AuthUser,proposalId:string,version:number,model:string,effort:ReasoningEffort|null,requestKey:string) {
    const hash=fingerprint({proposalId,version,model,effort,resume:true});let created=false;
    const job=await this.transaction(async client=>{
      await assertManager(client,binding.projectId,actor);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['agent:'+binding.projectId]);
      const previous=(await client.query<JobRow>('SELECT * FROM agent_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,requestKey])).rows[0];if(previous){if(previous.request_hash!==hash)throw new ProposalError('CONFLICT');return previous;}
      const row=(await client.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3 FOR UPDATE OF v',[binding.projectId,proposalId,version])).rows[0];
      const latest=(await client.query<{latest_version:number}>('SELECT latest_version FROM proposals WHERE project_id=$1 AND id=$2',[binding.projectId,proposalId])).rows[0];
      if(!row)throw new ProposalError('NOT_FOUND');if(latest?.latest_version!==version||!['draft','pending_review','pending_policy_check'].includes(row.state))throw new ProposalError('CONFLICT');
      if(!await this.current(client,row.context))throw new ProposalError('SOURCE_CHANGED');
      this.provider.connections.credentials(binding,model);if(effort&&!supportedEfforts(model).includes(effort))throw new ProposalError('UNSUPPORTED_EFFORT');
      if((await client.query("SELECT id FROM agent_jobs WHERE project_id=$1 AND status='running'",[binding.projectId])).rows.length)throw new ProposalError('CONFLICT');
      const inserted=(await client.query<JobRow>('INSERT INTO agent_jobs (project_id,proposal_id,version,requested_by,request_key,request_hash,model,reasoning_effort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[binding.projectId,proposalId,version,actor.id,requestKey,hash,model,effort])).rows[0]!;
      await this.audit(client,binding.projectId,actor.id,'agent.resume',inserted.id,'requested');created=true;return inserted;
    });
    if(created)this.launch(binding,actor,job);return jobView(job);
  }
  private async stageTransaction(job:JobRow,actor:AuthUser,operation:(client:pg.PoolClient)=>Promise<void>) {
    await this.transaction(async client=>{const active=await client.query("SELECT id FROM agent_jobs WHERE id=$1 AND status='running' FOR UPDATE",[job.id]);if(!active.rows.length)throw new ProposalError('JOB_INTERRUPTED');await assertManager(client,job.project_id,actor);
      const version=(await client.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3',[job.project_id,job.proposal_id,job.version])).rows[0];
      if(!version||!await this.current(client,version.context))throw new ProposalError('SOURCE_CHANGED');await operation(client);});
  }
  private async pipeline(binding:ConnectionBinding,actor:AuthUser,job:JobRow) {
    let stage:AgentStage='executor',input:unknown=null;
    try{
      const initial=this.provider.connections.credentials(binding,job.model);
      const row=(await this.database.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3',[job.project_id,job.proposal_id,job.version])).rows[0]!;
      let content=row.content,hash=row.content_hash,state=row.state;
      for(stage of ['executor','reviewer','approver'] as const){
        if(stage==='executor'&&state!=='draft'||stage==='reviewer'&&state!=='pending_review'||stage==='approver'&&state!=='pending_policy_check')continue;
        if(this.closed||this.provider.connections.credentials(binding,job.model).entry!==initial.entry)throw new ProposalError('CONNECTION_CHANGED');
        const expected=stage==='executor'?'draft':stage==='reviewer'?'pending_review':'pending_policy_check';
        const working=stage==='executor'?'draft':stage==='reviewer'?'in_review':'in_policy_check';
        await this.stageTransaction(job,actor,async client=>{const changed=await client.query('UPDATE proposal_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND state=$5 RETURNING version',[job.project_id,job.proposal_id,job.version,working,expected]);if(!changed.rowCount)throw new ProposalError('CONFLICT');});
        const prior=(await this.database.query("SELECT id,output FROM agent_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND status='succeeded' ORDER BY created_at DESC,id DESC LIMIT 1",[job.project_id,job.proposal_id,job.version])).rows[0];
        const messageId=randomUUID();
        input={schemaVersion:1,agentInstructionsVersion:'proposal-agents-v2',workflow:{phase:'preparation',humanApproval:'pending_by_design',externalExecutionEnabled:false},messageId,runId:job.id,createdAt:new Date().toISOString(),correlationId:job.proposal_id,causationId:prior?.id??null,snapshotIds:{trello:row.context.trelloSnapshotId},policyVersion:row.context.policyVersion,producer:'service',recipient:stage,projectId:job.project_id,proposalId:job.proposal_id,version:job.version,jobId:job.id,context:row.context,goal:row.goal,requestedDue:row.requested_due.toISOString(),contentHash:hash,content,priorReview:stage==='approver'?prior?.output??null:null};
        const response=await this.provider.generate(binding,actor,job.model,job.reasoning_effort,instructions(stage),JSON.stringify(input));
        if(this.closed||this.provider.connections.credentials(binding,job.model).entry!==initial.entry)throw new ProposalError('CONNECTION_CHANGED');
        let output:unknown,next:ProposalState;
        if(stage==='executor'){content=parseContent(response.output,row.context,row.requested_due.toISOString());hash=fingerprint({schemaVersion:1,context:row.context,goal:row.goal,requestedDue:row.requested_due.toISOString(),content});output=content;next='pending_review';}
        else {const verdict=parseVerdict(response.output,stage,hash!);output=verdict;
          if(stage==='reviewer'&&verdict.verdict==='validated'&&content!.unresolvedQuestions.length)throw new ProposalError('BLOCKING_QUESTIONS');
          next=verdict.verdict==='validated'?'pending_policy_check':verdict.verdict==='human_required'?'pending_human_approval':verdict.verdict;
        }
        await this.stageTransaction(job,actor,async client=>{
          if(stage==='executor')await client.query('INSERT INTO proposal_contents (project_id,proposal_id,version,content_hash,content) VALUES ($1,$2,$3,$4,$5)',[job.project_id,job.proposal_id,job.version,hash,JSON.stringify(content)]);
          await client.query('INSERT INTO agent_messages (project_id,proposal_id,version,job_id,stage,status,input,output,duration_ms,usage,id) VALUES ($1,$2,$3,$4,$5,\'succeeded\',$6,$7,$8,$9,$10)',[job.project_id,job.proposal_id,job.version,job.id,stage,JSON.stringify(input),JSON.stringify(output),response.durationMs,JSON.stringify(response.usage),messageId]);
          await client.query('UPDATE proposal_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[job.project_id,job.proposal_id,job.version,next]);await this.audit(client,job.project_id,actor.id,'agent.'+stage,job.id,'succeeded');
        });state=next;
        if(['rejected','changes_requested'].includes(state))break;
      }
      await this.transaction(async client=>{await client.query("UPDATE agent_jobs SET status='succeeded',finished_at=clock_timestamp() WHERE id=$1 AND status='running'",[job.id]);await this.audit(client,job.project_id,actor.id,'agent.finish',job.id,'succeeded');});
    }catch(error){
      const errorCode=this.closed?'SERVICE_STOPPED':code(error);
      await this.transaction(async client=>{
        const changed=await client.query("UPDATE agent_jobs SET status=$2,error_code=$3,finished_at=clock_timestamp() WHERE id=$1 AND status='running' RETURNING id",[job.id,this.closed?'interrupted':'failed',errorCode]);
        if(!changed.rowCount)return;
        if(errorCode==='SOURCE_CHANGED')await client.query("UPDATE proposal_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[job.project_id,job.proposal_id,job.version]);
        await client.query("UPDATE proposal_versions SET state=CASE state WHEN 'in_review' THEN 'pending_review' WHEN 'in_policy_check' THEN 'pending_policy_check' ELSE state END WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[job.project_id,job.proposal_id,job.version]);
        await client.query("INSERT INTO agent_messages (project_id,proposal_id,version,job_id,stage,status,input,error_code) VALUES ($1,$2,$3,$4,$5,'failed',$6,$7)",[job.project_id,job.proposal_id,job.version,job.id,stage,JSON.stringify(input),errorCode]);await this.audit(client,job.project_id,actor.id,'agent.finish',job.id,'failed');
      });
    }
  }
  async recheck(projectId:string,actor:AuthUser,proposalId:string,version:number) {
    return this.transaction(async client=>{
      await assertManager(client,projectId,actor);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['agent:'+projectId]);
      const row=(await client.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3 FOR UPDATE OF v',[projectId,proposalId,version])).rows[0];if(!row)throw new ProposalError('NOT_FOUND');
      if((await client.query("SELECT id FROM agent_jobs WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND status='running'",[projectId,proposalId,version])).rowCount)throw new ProposalError('CONFLICT');
      if(['rejected','changes_requested','invalidated'].includes(row.state)||await this.current(client,row.context))return {state:row.state};
      await client.query("UPDATE proposal_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[projectId,proposalId,version]);await this.audit(client,projectId,actor.id,'proposal.invalidate',proposalId,'succeeded');return {state:'invalidated' as const};
    });
  }
  async decide(projectId:string,actor:AuthUser,proposalId:string,version:number,hash:string,decision:'approved'|'rejected'|'changes_requested',reason:string,requestKey:string) {
    safeText(reason);if(decision!=='approved'&&!reason.trim())throw new ProposalError('REASON_REQUIRED');
    return this.transaction(async client=>{
      await assertManager(client,projectId,actor);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['agent:'+projectId]);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['trello:'+projectId]);
      const row=(await client.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3 FOR UPDATE OF v',[projectId,proposalId,version])).rows[0];if(!row)throw new ProposalError('NOT_FOUND');
      const previous=(await client.query('SELECT * FROM proposal_decisions WHERE project_id=$1 AND actor_id=$2 AND request_key=$3',[projectId,actor.id,requestKey])).rows[0];
      if(previous){if(previous.proposal_id!==proposalId||previous.version!==version||previous.content_hash!==hash||previous.decision!==decision||previous.reason!==reason)throw new ProposalError('CONFLICT');return {state:row.state,decisionId:previous.id,invalidated:false};}
      const latest=(await client.query<{latest_version:number}>('SELECT latest_version FROM proposals WHERE project_id=$1 AND id=$2',[projectId,proposalId])).rows[0];
      if(latest?.latest_version!==version||row.state!=='pending_human_approval'||row.content_hash!==hash)throw new ProposalError('CONFLICT');
      if(!await this.current(client,row.context)){await client.query("UPDATE proposal_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[projectId,proposalId,version]);await this.audit(client,projectId,actor.id,'proposal.invalidate',proposalId,'succeeded');return {state:'invalidated' as const,decisionId:null,invalidated:true};}
      const messages=(await client.query("SELECT stage,output FROM agent_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND status='succeeded'",[projectId,proposalId,version])).rows;
      if(!messages.some(message=>message.stage==='reviewer'&&message.output.verdict==='validated')||!messages.some(message=>message.stage==='approver'&&message.output.verdict==='human_required'))throw new ProposalError('MISSING_REVIEW');
      const state=decision==='approved'?'authorized':decision;
      const inserted=(await client.query<{id:string}>('INSERT INTO proposal_decisions (project_id,proposal_id,version,actor_id,content_hash,request_key,decision,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[projectId,proposalId,version,actor.id,hash,requestKey,decision,reason])).rows[0]!;
      await client.query('UPDATE proposal_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[projectId,proposalId,version,state]);await this.audit(client,projectId,actor.id,'proposal.'+decision,proposalId,'succeeded');return {state,decisionId:inserted.id,invalidated:false};
    });
  }
  async waitForIdle() {await Promise.allSettled(this.tasks);}
  async close() {this.closed=true;await this.waitForIdle();}
}
