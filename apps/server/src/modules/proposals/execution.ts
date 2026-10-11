import type pg from 'pg';
import type {ExecutionJobView,ExecutionOverview,ExecutionEventView,ProposalContent,ProposalState,TrelloItem} from '@dev-project-agent/contracts';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {AuthDatabase,AuthUser} from '../auth/repository.js';
import {assertManager} from '../supervision/access.js';
import {ExecutionError,type ExecutionRemote} from '../../integrations/trello/execution-client.js';
import {assertTargetDate,fingerprint,parseContent,parseVerdict,safeText,type ProposalContext} from './contracts.js';
import {cardHash} from './service.js';

interface JobRow {id:string;project_id:string;proposal_id:string;version:number;approval_id:string;requested_by:string;requested_auth_version:number;request_hash:string;content_hash:string;status:ExecutionJobView['status'];error_code:string|null;created_at:Date;write_started_at:Date|null;finished_at:Date|null}
interface Candidate {purpose:'demonstration'|'live';state:ProposalState;latest_version:number;context:ProposalContext;goal:string;requested_due:Date;content:ProposalContent;content_hash:string;approval_id:string;actor_id:string;actor_auth_version:number|null;decision:string;approval_hash:string}
const selectCandidate=`SELECT p.purpose,p.latest_version,v.state,v.context,v.goal,v.requested_due,c.content,c.content_hash,d.id AS approval_id,d.actor_id,d.actor_auth_version,d.decision,d.content_hash AS approval_hash FROM proposals p JOIN proposal_versions v ON v.project_id=p.project_id AND v.proposal_id=p.id LEFT JOIN proposal_contents c ON c.project_id=v.project_id AND c.proposal_id=v.proposal_id AND c.version=v.version LEFT JOIN proposal_decisions d ON d.project_id=v.project_id AND d.proposal_id=v.proposal_id AND d.version=v.version WHERE p.project_id=$1 AND p.id=$2 AND v.version=$3`;
const view=(row:JobRow):ExecutionJobView=>({id:row.id,proposalId:row.proposal_id,version:row.version,contentHash:row.content_hash,status:row.status,errorCode:row.error_code,createdAt:row.created_at.toISOString(),writeStartedAt:row.write_started_at?.toISOString()??null,finishedAt:row.finished_at?.toISOString()??null});
const errorCode=(error:unknown)=>error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z_]{1,60}$/.test(error.code)?error.code:'EXECUTION_FAILED';
export interface ExecutionOptions {enabled:boolean;remote:ExecutionRemote|null;onFailure?:()=>void}

export class ExecutionService {
  private tasks=new Set<Promise<void>>();private closed=false;
  constructor(readonly database:TrelloDatabase,readonly options:ExecutionOptions) {}
  private async transaction<T>(operation:(client:pg.PoolClient)=>Promise<T>) {
    const client=await this.database.connect();try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private async event(db:AuthDatabase,job:JobRow,stage:ExecutionEventView['stage'],outcome:ExecutionEventView['outcome'],code:string|null=null,evidence:ExecutionEventView['evidence']=null) {
    await db.query('INSERT INTO execution_events (project_id,job_id,stage,outcome,error_code,evidence) VALUES ($1,$2,$3,$4,$5,$6)',[job.project_id,job.id,stage,outcome,code,evidence?JSON.stringify(evidence):null]);
    await db.query("INSERT INTO audit_events (project_id,actor_type,action,resource_type,resource_id,outcome) VALUES ($1,'system',$2,'execution_job',$3,$4)",[job.project_id,'execution.'+stage,job.id,outcome==='uncertain'?'failed':outcome]);
  }
  private async finish(job:JobRow,status:JobRow['status'],state:ProposalState,stage:ExecutionEventView['stage'],code:string|null=null,evidence:ExecutionEventView['evidence']=null) {
    await this.transaction(async db=>{
      const changed=await db.query("UPDATE execution_jobs SET status=$2,error_code=$3,finished_at=clock_timestamp() WHERE id=$1 AND status IN ('queued','running','reconciliation_required') RETURNING id",[job.id,status,code]);
      if(!changed.rowCount)throw new ExecutionError('CONFLICT');
      await db.query('UPDATE proposal_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[job.project_id,job.proposal_id,job.version,state]);
      await this.event(db,job,stage,status==='succeeded'?'succeeded':status==='reconciliation_required'?'uncertain':'failed',code,evidence);
    });
  }
  async initialize() {
    await this.transaction(async db=>{
      const jobs=(await db.query<JobRow>("SELECT * FROM execution_jobs WHERE status IN ('queued','running') FOR UPDATE")).rows;
      for(const job of jobs){const uncertain=Boolean(job.write_started_at);await db.query('UPDATE execution_jobs SET status=$2,error_code=$3,finished_at=clock_timestamp() WHERE id=$1',[job.id,uncertain?'reconciliation_required':'failed','SERVICE_RESTARTED']);await db.query('UPDATE proposal_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[job.project_id,job.proposal_id,job.version,uncertain?'reconciliation_required':'execution_failed']);await this.event(db,job,'recovery',uncertain?'uncertain':'failed','SERVICE_RESTARTED');}
    });
  }
  async overview(projectId:string):Promise<ExecutionOverview> {
    const jobs=await this.database.query<JobRow>('SELECT * FROM execution_jobs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[projectId]);return {writesEnabled:this.options.enabled,credentialsConfigured:Boolean(this.options.remote),jobs:jobs.rows.map(view)};
  }
  async detail(projectId:string,id:string) {
    const job=(await this.database.query<JobRow>('SELECT * FROM execution_jobs WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];if(!job)return null;
    const rows=await this.database.query('SELECT id,stage,outcome,error_code AS "errorCode",evidence,created_at AS "createdAt" FROM execution_events WHERE project_id=$1 AND job_id=$2 ORDER BY created_at,id',[projectId,id]);
    return {job:view(job),events:rows.rows.map(row=>({...row,createdAt:row.createdAt.toISOString()})) as ExecutionEventView[]};
  }
  private async candidate(db:AuthDatabase,projectId:string,proposalId:string,version:number,hash:string,allowed:ProposalState[]) {
    const row=(await db.query<Candidate>(selectCandidate,[projectId,proposalId,version])).rows[0];if(!row)throw new ExecutionError('NOT_FOUND');
    if(row.purpose!=='live')throw new ExecutionError('DEMONSTRATION_ONLY');
    if(row.latest_version!==version||!allowed.includes(row.state))throw new ExecutionError('CONFLICT');
    if(!row.content||row.content_hash!==hash||fingerprint({schemaVersion:1,context:row.context,goal:row.goal,requestedDue:row.requested_due.toISOString(),content:row.content})!==hash)throw new ExecutionError('HASH_MISMATCH');
    parseContent(row.content,row.context,row.requested_due.toISOString());
    if(!row.approval_id||row.decision!=='approved'||row.approval_hash!==hash||!row.actor_auth_version)throw new ExecutionError('MISSING_APPROVAL');
    await assertManager(db,projectId,{id:row.actor_id,auth_version:row.actor_auth_version});
    const messages=(await db.query("SELECT stage,input,output FROM agent_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND status='succeeded' AND stage IN ('reviewer','approver')",[projectId,proposalId,version])).rows;
    for(const stage of ['reviewer','approver'] as const){const message=messages.find(message=>message.stage===stage&&message.input.contentHash===hash);if(!message||parseVerdict(message.output,stage,hash).verdict!==(stage==='reviewer'?'validated':'human_required'))throw new ExecutionError('MISSING_REVIEW');}
    if(row.content.unresolvedQuestions.length)throw new ExecutionError('BLOCKING_QUESTIONS');
    return row;
  }
  private async configuration(db:AuthDatabase,projectId:string,row:Candidate) {
    const policy=(await db.query<{version:number}>('SELECT version FROM tracking_policy_versions WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];
    const baseline=(await db.query<{version:number}>('SELECT version FROM baseline_versions WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];
    const destination=(await db.query<{board_id:string;operational_list_ids:string[]}>('SELECT board_id,operational_list_ids FROM trello_connections WHERE project_id=$1',[projectId])).rows[0];
    if(policy?.version!==row.context.policyVersion||(baseline?.version??null)!==row.context.baselineVersion||!destination||!row.context.destination||destination.board_id!==row.context.destination.boardId||fingerprint(destination.operational_list_ids)!==fingerprint(row.context.destination.operationalListIds))throw new ExecutionError('SOURCE_CHANGED');
    return destination;
  }
  async request(projectId:string,actor:AuthUser,proposalId:string,version:number,hash:string,requestKey:string,confirmed:boolean) {
    if(!confirmed)throw new ExecutionError('CONFIRMATION_REQUIRED');let created=false;const requestHash=fingerprint({proposalId,version,hash,confirmed});
    const job=await this.transaction(async db=>{
      await assertManager(db,projectId,actor);await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['agent:'+projectId]);
      const previous=(await db.query<JobRow>('SELECT * FROM execution_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[projectId,actor.id,requestKey])).rows[0];if(previous){if(previous.request_hash!==requestHash)throw new ExecutionError('CONFLICT');return previous;}
      const row=await this.candidate(db,projectId,proposalId,version,hash,['authorized','execution_failed']);
      if(this.closed||!this.options.enabled||!this.options.remote)throw new ExecutionError('WRITES_DISABLED');
      await this.configuration(db,projectId,row);assertTargetDate(row.requested_due.toISOString(),row.context.card.start);
      if((await db.query("SELECT id FROM execution_jobs WHERE project_id=$1 AND status IN ('queued','running','reconciliation_required')",[projectId])).rowCount)throw new ExecutionError('CONFLICT');
      const inserted=(await db.query<JobRow>('INSERT INTO execution_jobs (project_id,proposal_id,version,approval_id,requested_by,requested_auth_version,request_key,request_hash,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[projectId,proposalId,version,row.approval_id,actor.id,actor.auth_version,requestKey,requestHash,hash])).rows[0]!;
      await db.query("UPDATE proposal_versions SET state='executing' WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[projectId,proposalId,version]);await this.event(db,inserted,'request','requested');created=true;return inserted;
    });
    if(created){const task=this.run(job).catch(()=>this.options.onFailure?.());this.tasks.add(task);void task.then(()=>this.tasks.delete(task));}return view(job);
  }
  private evidence(item:TrelloItem,boardId:string):ExecutionEventView['evidence'] {return {cardId:item.id,boardId,due:item.due,fingerprint:cardHash(item),observedAt:new Date().toISOString()};}
  private matches(item:TrelloItem|undefined,row:Candidate,after=false) {
    return Boolean(item&&(!after?cardHash(item)===row.context.sourceFingerprint:item.due===row.requested_due.toISOString()&&cardHash({...item,due:row.context.card.due})===row.context.sourceFingerprint));
  }
  private async withLocks<T>(projectId:string,operation:()=>Promise<T>) {
    const client=await this.database.connect(),held:string[]=[];
    try{for(const key of ['execution:'+projectId,'trello:'+projectId,'tracking-policy:'+projectId]){const result=await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[key]);if(!result.rows[0]?.locked)throw new ExecutionError('CONFLICT');held.push(key);}return await operation();}
    finally{let destroy=false;try{for(const key of held.reverse())await client.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);}catch{destroy=true;}finally{client.release(destroy);}}
  }
  private async run(job:JobRow) {
    let writeStarted=false;
    try{await this.withLocks(job.project_id,async()=>{
      if(this.closed||!this.options.enabled||!this.options.remote)throw new ExecutionError('WRITES_DISABLED');const remote=this.options.remote;
      const claimed=await this.database.query("UPDATE execution_jobs SET status='running',started_at=clock_timestamp() WHERE id=$1 AND status='queued'",[job.id]);if(!claimed.rowCount)throw new ExecutionError('CONFLICT');
      const row=await this.candidate(this.database,job.project_id,job.proposal_id,job.version,job.content_hash,['executing']);
      const destination=await this.configuration(this.database,job.project_id,row);
      await remote.assertPermission(destination.board_id);
      const before=(await remote.read(destination.board_id,destination.operational_list_ids)).items.find(item=>item.id===row.context.card.id);
      if(!this.matches(before,row))throw new ExecutionError('SOURCE_CHANGED');
      await this.transaction(async db=>{
        await assertManager(db,job.project_id,{id:job.requested_by,auth_version:job.requested_auth_version});
        const checked=await this.candidate(db,job.project_id,job.proposal_id,job.version,job.content_hash,['executing']);
        if(checked.approval_id!==job.approval_id)throw new ExecutionError('MISSING_APPROVAL');
        await this.configuration(db,job.project_id,checked);assertTargetDate(checked.requested_due.toISOString(),before!.start);
        await this.event(db,job,'preflight','succeeded',null,this.evidence(before!,destination.board_id));
        const marked=await db.query("UPDATE execution_jobs SET write_started_at=clock_timestamp() WHERE id=$1 AND status='running'",[job.id]);if(!marked.rowCount)throw new ExecutionError('CONFLICT');await this.event(db,job,'write','started');
      });
      // The durable boundary precedes the only PUT. After it, storage/network failures never authorize a retry.
      writeStarted=true;
      if(this.closed)throw new ExecutionError('SERVICE_STOPPED',true);
      try{await remote.write(row.context.card.id,row.requested_due.toISOString());}
      catch(error){if(error instanceof ExecutionError&&!error.uncertain){await this.finish(job,'failed','execution_failed','write',error.code);return;}}
      let after:TrelloItem|undefined;
      try{after=(await remote.read(destination.board_id,destination.operational_list_ids)).items.find(item=>item.id===row.context.card.id);}
      catch{await this.finish(job,'reconciliation_required','reconciliation_required','verification','REMOTE_READ_FAILED');return;}
      if(this.matches(after,row,true))await this.finish(job,'succeeded','executed','verification',null,this.evidence(after!,destination.board_id));
      else await this.finish(job,'reconciliation_required','reconciliation_required','verification','REMOTE_DISCREPANCY',after?this.evidence(after,destination.board_id):null);
    });}catch(error){
      const code=errorCode(error),invalid=['SOURCE_CHANGED','FORBIDDEN','HASH_MISMATCH','MISSING_APPROVAL','MISSING_REVIEW','BLOCKING_QUESTIONS'].includes(code);
      await this.finish(job,writeStarted?'reconciliation_required':invalid?'blocked':'failed',writeStarted?'reconciliation_required':invalid?'invalidated':'execution_failed',writeStarted?'verification':'preflight',code);
    }
  }
  async reconcile(projectId:string,actor:AuthUser,id:string) {
    await assertManager(this.database,projectId,actor);
    const job=(await this.database.query<JobRow>('SELECT * FROM execution_jobs WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];if(!job)throw new ExecutionError('NOT_FOUND');if(job.status!=='reconciliation_required')throw new ExecutionError('CONFLICT');
    if(!this.options.remote)throw new ExecutionError('REMOTE_READ_FAILED');
    await this.withLocks(projectId,async()=>{
      // Reconciliation checks observed effect, even if the approving manager has since lost authority. It never writes.
      const row=(await this.database.query<Candidate>(selectCandidate,[projectId,job.proposal_id,job.version])).rows[0]!;
      const destination=row.context.destination;if(!destination)throw new ExecutionError('SOURCE_CHANGED');
      const after=(await this.options.remote!.read(destination.boardId,destination.operationalListIds)).items.find(item=>item.id===row.context.card.id);
      await assertManager(this.database,projectId,actor);
      if(this.matches(after,row,true))await this.finish(job,'succeeded','executed','reconciliation',null,this.evidence(after!,destination.boardId));
      else await this.finish(job,'reconciliation_required','reconciliation_required','reconciliation','REMOTE_DISCREPANCY',after?this.evidence(after,destination.boardId):null);
    });return this.detail(projectId,id);
  }
  async withdraw(projectId:string,actor:AuthUser,proposalId:string,version:number,reason:string) {
    safeText(reason);if(!reason.trim()||reason.length>1000)throw new ExecutionError('REASON_REQUIRED');
    return this.transaction(async db=>{
      await assertManager(db,projectId,actor);await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['agent:'+projectId]);
      const changed=await db.query("UPDATE proposal_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND state IN ('authorized','execution_failed') RETURNING version",[projectId,proposalId,version]);if(!changed.rowCount)throw new ExecutionError('CONFLICT');
      await db.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome,details) VALUES ($1,'user',$2,'proposal.withdraw','proposal',$3,'succeeded',$4)",[projectId,actor.id,proposalId+':v'+version,JSON.stringify({reason})]);return {state:'invalidated' as const};
    });
  }
  async waitForIdle(){await Promise.allSettled(this.tasks);}
  async close(){this.closed=true;await this.waitForIdle();}
}
