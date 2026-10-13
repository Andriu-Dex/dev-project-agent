import {publicationOverview} from './publication.js';
import type pg from 'pg';
import type {AgentStage,CodeAnalysisResult,CodeAnalysisView,CodeCandidate,CodeOverview,CodeProposalView,CodePublicationView,CodeSource,ProposalState,ReasoningEffort} from '@dev-project-agent/contracts';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {AuthDatabase,AuthUser} from '../auth/repository.js';
import {assertManager} from '../supervision/access.js';
import {ChatGPTService,providerCode} from '../../providers/chatgpt/service.js';
import type {ConnectionBinding} from '../../providers/chatgpt/connection.js';
import {supportedEfforts} from '../../providers/chatgpt/validation.js';
import {GitHubError,type GitHubConnection} from '../../integrations/github/client.js';
import {githubApi,gitSha,readCodeCatalog,readCodeSource} from '../../integrations/github/code-client.js';
import {fingerprint,safeText,ProposalError} from '../proposals/contracts.js';
import {CodeError,analysisInstructions,buildCandidate,correctionInstructions,deterministicAnalysis,modelSource,parseAnalysis,parseCodeVerdict} from './evidence.js';

export interface AnalysisRequest {paths:string[];expectedHead:string;mode:'files'|'comparison';baseSha?:string;withAi:boolean;consent?:boolean;model?:string;reasoningEffort?:ReasoningEffort;requestKey:string}
export interface CorrectionRequest {purpose?:'demonstration'|'live';analysisId:string;findingIds:string[];goal:string;model:string;reasoningEffort?:ReasoningEffort;consent:boolean;requestKey:string;proposalId?:string;expectedVersion?:number}
type Actor=Pick<AuthUser,'id'|'auth_version'>;
interface AnalysisRow {id:string;project_id:string;requested_by:string;status:CodeAnalysisView['status'];error_code:string|null;created_at:Date;finished_at:Date|null;model:string|null;reasoning_effort:ReasoningEffort|null;request_hash:string;source:CodeSource|null;result:CodeAnalysisResult|null}
interface VersionRow {purpose:'demonstration'|'live';project_id:string;proposal_id:string;version:number;latest_version:number;state:ProposalState;analysis_id:string;goal:string;finding_ids:string[];created_at:Date;candidate:CodeCandidate|null;content_hash:string|null}
interface JobRow {id:string;project_id:string;proposal_id:string;version:number;status:'running'|'succeeded'|'failed'|'interrupted';error_code:string|null;model:string;reasoning_effort:ReasoningEffort|null;request_hash:string}
const analysisSelect='SELECT a.*,s.source,r.result FROM code_analyses a LEFT JOIN code_sources s ON s.project_id=a.project_id AND s.analysis_id=a.id LEFT JOIN code_results r ON r.project_id=a.project_id AND r.analysis_id=a.id';
const versionSelect='SELECT v.*,p.latest_version,p.purpose,c.candidate,c.content_hash FROM code_versions v JOIN code_proposals p ON p.project_id=v.project_id AND p.id=v.proposal_id LEFT JOIN code_candidates c ON c.project_id=v.project_id AND c.proposal_id=v.proposal_id AND c.version=v.version';
const errorCode=(error:unknown)=>error instanceof CodeError||error instanceof GitHubError||error instanceof ProposalError?error.code:providerCode(error);
const analysisView=(row:AnalysisRow):CodeAnalysisView=>({id:row.id,status:row.status,errorCode:row.error_code,createdAt:row.created_at.toISOString(),finishedAt:row.finished_at?.toISOString()??null,model:row.model,reasoningEffort:row.reasoning_effort,source:row.source,result:row.result});

export class CodeReviewService {
  private tasks=new Set<Promise<void>>();private closed=false;
  constructor(readonly database:TrelloDatabase,readonly provider:ChatGPTService,readonly token:string|null,readonly fetcher:typeof fetch=fetch,private readonly onFailure:()=>void=()=>{},readonly publicationConfiguration:{enabled:boolean;token:string|null}={enabled:false,token:null}) {}
  private async transaction<T>(operation:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
    const client=await this.database.connect();try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private async audit(database:AuthDatabase,projectId:string,actor:Actor|null,action:string,id:string,outcome:string) {
    await database.query("INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,$2,$3,$4,'code_review',$5,$6)",[projectId,actor?'user':'system',actor?.id??null,action,id,outcome]);
  }
  private async lock(database:AuthDatabase,projectId:string,actor:Actor) {await assertManager(database,projectId,actor);await database.query('SELECT pg_advisory_xact_lock(hashtext($1))',['code:'+projectId]);}
  private async idle(database:AuthDatabase,projectId:string) {
    if((await database.query("SELECT id FROM code_jobs WHERE project_id=$1 AND status='running' UNION ALL SELECT id FROM code_analyses WHERE project_id=$1 AND status='running'",[projectId])).rowCount)throw new CodeError('CONFLICT');
  }
  private launch(task:Promise<void>) {const tracked=task.catch(()=>this.onFailure());this.tasks.add(tracked);void tracked.then(()=>this.tasks.delete(tracked));}
  async waitForIdle(){await Promise.allSettled([...this.tasks]);}
  async close(){this.closed=true;await this.waitForIdle();}
  async initialize(){await this.transaction(async client=>{
    for(const table of ['code_analyses','code_jobs']){const rows=await client.query(`UPDATE ${table} SET status='interrupted',error_code='SERVICE_RESTARTED',finished_at=clock_timestamp() WHERE status='running' RETURNING project_id,id`);for(const row of rows.rows)await this.audit(client,row.project_id,null,'code.recovery',row.id,'interrupted');}
  });}
  private async connection(database:AuthDatabase,projectId:string):Promise<GitHubConnection> {
    const row=(await database.query<GitHubConnection>('SELECT owner,repository,branch FROM github_connections WHERE project_id=$1',[projectId])).rows[0];if(!row)throw new CodeError('NOT_CONFIGURED');return row;
  }
  async catalog(projectId:string,actor:Actor) {
    await assertManager(this.database,projectId,actor);const connection=await this.connection(this.database,projectId),catalog=await readCodeCatalog(connection,this.token,this.fetcher);
    await assertManager(this.database,projectId,actor);if(fingerprint(connection)!==fingerprint(await this.connection(this.database,projectId)))throw new CodeError('SOURCE_CHANGED');
    // Tree inventory is retained with the source, but the selector needs only eligible file metadata.
    return {...catalog,inventory:[]};
  }
  async analysis(projectId:string,id:string):Promise<CodeAnalysisView|null> {const row=(await this.database.query<AnalysisRow>(analysisSelect+' WHERE a.project_id=$1 AND a.id=$2',[projectId,id])).rows[0];return row?analysisView(row):null;}
  async overview(projectId:string):Promise<CodeOverview> {
    const analyses=await this.database.query<AnalysisRow>('SELECT * FROM code_analyses WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[projectId]);
    const proposals=await this.database.query('SELECT p.id,p.purpose,v.version,v.state,v.goal,v.created_at FROM code_proposals p JOIN code_versions v ON v.project_id=p.project_id AND v.proposal_id=p.id AND v.version=p.latest_version WHERE p.project_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 30',[projectId]);
    const jobs=await this.database.query<JobRow>('SELECT * FROM code_jobs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[projectId]);
    return {analyses:analyses.rows.map(row=>{const {source:ignoredSource,result:ignoredResult,...view}=analysisView({...row,source:null,result:null});return view;}),proposals:proposals.rows.map(row=>({id:row.id,version:row.version,purpose:row.purpose,state:row.state,goal:row.goal,createdAt:row.created_at.toISOString()})),jobs:jobs.rows.map(row=>({id:row.id,proposalId:row.proposal_id,version:row.version,status:row.status,errorCode:row.error_code})),publications:await this.publications(projectId),writesEnabled:this.publicationConfiguration.enabled,writeCredentialsConfigured:Boolean(this.publicationConfiguration.token)};
  }
  private validateProvider(binding:ConnectionBinding,model:string|undefined,effort:ReasoningEffort|null,consent:boolean) {
    if(!consent)throw new CodeError('CONSENT_REQUIRED');if(!model)throw new CodeError('INVALID_REQUEST');
    const credentials=this.provider.connections.credentials(binding,model);if(effort&&!supportedEfforts(model).includes(effort))throw new CodeError('UNSUPPORTED_EFFORT');return credentials;
  }
  async validateScheduledProvider(binding:ConnectionBinding,model:string,effort:ReasoningEffort|null) {
    await assertManager(this.database,binding.projectId,{id:binding.userId,auth_version:binding.authVersion});
    await this.provider.ensureConnection(binding);this.validateProvider(binding,model,effort,true);
  }
  async analyze(binding:ConnectionBinding,actor:AuthUser,request:AnalysisRequest) {
    await assertManager(this.database,binding.projectId,actor);if(this.closed)throw new CodeError('SERVICE_CLOSED');
    if(request.withAi&&request.consent)await this.provider.ensureConnection(binding);
    const {requestKey:ignored,...payload}=request,hash=fingerprint(payload),effort=request.reasoningEffort??null;
    const previous=(await this.database.query<AnalysisRow>('SELECT * FROM code_analyses WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,request.requestKey])).rows[0];
    if(previous){if(previous.request_hash!==hash)throw new CodeError('CONFLICT');return {id:previous.id};}
    if(request.withAi)this.validateProvider(binding,request.model,effort,request.consent===true);
    const connection=await this.connection(this.database,binding.projectId),source=await readCodeSource(connection,{...request,baseSha:request.baseSha??null},this.token,this.fetcher);
    const row=await this.transaction(async client=>{
      await this.lock(client,binding.projectId,actor);
      const duplicate=(await client.query<AnalysisRow>('SELECT * FROM code_analyses WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,request.requestKey])).rows[0];if(duplicate){if(duplicate.request_hash!==hash)throw new CodeError('CONFLICT');return {id:duplicate.id,created:false};}
      await this.idle(client,binding.projectId);if(fingerprint(connection)!==fingerprint(await this.connection(client,binding.projectId)))throw new CodeError('SOURCE_CHANGED');
      if(request.withAi)this.validateProvider(binding,request.model,effort,request.consent===true);
      const created=(await client.query<{id:string}>('INSERT INTO code_analyses(project_id,requested_by,request_key,request_hash,model,reasoning_effort,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[binding.projectId,actor.id,request.requestKey,hash,request.withAi?request.model:null,request.withAi?effort:null,request.withAi?'running':'ready'])).rows[0]!;
      await client.query('INSERT INTO code_sources(project_id,analysis_id,source) VALUES($1,$2,$3)',[binding.projectId,created.id,JSON.stringify(source)]);
      if(!request.withAi){await client.query('INSERT INTO code_results(project_id,analysis_id,result) VALUES($1,$2,$3)',[binding.projectId,created.id,JSON.stringify(deterministicAnalysis(source))]);await client.query('UPDATE code_analyses SET finished_at=clock_timestamp() WHERE id=$1',[created.id]);}
      await this.audit(client,binding.projectId,actor,'code.analysis',created.id,request.withAi?'started':'succeeded');return {...created,created:true};
    });
    if(row.created&&request.withAi)this.launch(this.analyzeWithModel(binding,actor,row.id,source,request.model!,effort));return {id:row.id};
  }
  private async analyzeWithModel(binding:ConnectionBinding,actor:AuthUser,id:string,source:CodeSource,model:string,effort:ReasoningEffort|null) {
    try{
      const credentials=this.provider.connections.credentials(binding,model),response=await this.provider.generate(binding,actor,model,effort,analysisInstructions,JSON.stringify({recipient:'code_analyst',source:modelSource(source)}));
      if(this.closed||this.provider.connections.credentials(binding,model).entry!==credentials.entry)throw new CodeError('CONNECTION_CHANGED');
      const local=deterministicAnalysis(source),inferred=parseAnalysis(response.output,source),result={...local,...inferred};
      result.findings=[...inferred.findings,...local.findings.filter(item=>!inferred.findings.some(value=>value.path===item.path&&value.startLine===item.startLine&&value.category===item.category))].slice(0,20);
      result.limitations=[...new Set([...local.limitations,...inferred.limitations])];
      await this.transaction(async client=>{await this.lock(client,binding.projectId,actor);const updated=await client.query("UPDATE code_analyses SET status='ready',finished_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND status='running' RETURNING id",[binding.projectId,id]);if(!updated.rowCount)throw new CodeError('CONFLICT');await client.query('INSERT INTO code_results(project_id,analysis_id,result,usage,duration_ms) VALUES($1,$2,$3,$4,$5)',[binding.projectId,id,JSON.stringify(result),JSON.stringify(response.usage),response.durationMs]);await this.audit(client,binding.projectId,actor,'code.analysis',id,'succeeded');});
    }catch(error){await this.transaction(async client=>{await client.query("UPDATE code_analyses SET status='failed',error_code=$3,finished_at=clock_timestamp() WHERE project_id=$1 AND id=$2 AND status='running'",[binding.projectId,id,errorCode(error)]);await this.audit(client,binding.projectId,null,'code.analysis',id,'failed');});}
  }
  private async fresh(projectId:string,source:CodeSource) {
    if(fingerprint(await this.connection(this.database,projectId))!==fingerprint(source.connection))throw new CodeError('SOURCE_CHANGED');
    const commit=await githubApi(source.connection,this.token,this.fetcher).get('/commits/'+encodeURIComponent(source.connection.branch)) as {sha:unknown;commit:{tree:{sha:unknown}}};
    if(gitSha(commit.sha)!==source.head||gitSha(commit.commit?.tree?.sha)!==source.treeSha)throw new CodeError('SOURCE_CHANGED');
  }
  private async versionRow(database:AuthDatabase,projectId:string,id:string,version:number) {const row=(await database.query<VersionRow>(versionSelect+' WHERE v.project_id=$1 AND v.proposal_id=$2 AND v.version=$3',[projectId,id,version])).rows[0];if(!row)throw new CodeError('NOT_FOUND');return row;}
  async version(projectId:string,id:string,version:number):Promise<CodeProposalView> {
    const row=await this.versionRow(this.database,projectId,id,version);
    const messages=await this.database.query('SELECT id,job_id AS "jobId",stage,status,output,error_code AS "errorCode",duration_ms AS "durationMs",usage,created_at AS "createdAt",model,reasoning_effort AS "reasoningEffort" FROM code_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 ORDER BY created_at,id',[projectId,id,version]);
    const decisions=await this.database.query('SELECT id,decision,reason,created_at AS "createdAt" FROM code_decisions WHERE project_id=$1 AND proposal_id=$2 AND version=$3 ORDER BY created_at,id',[projectId,id,version]);
    return {id,version,latestVersion:row.latest_version,purpose:row.purpose,state:row.state,analysisId:row.analysis_id,goal:row.goal,findingIds:row.finding_ids,createdAt:row.created_at.toISOString(),candidate:row.candidate,contentHash:row.content_hash,messages:messages.rows.map(row=>({...row,createdAt:row.createdAt.toISOString()})) as CodeProposalView['messages'],decisions:decisions.rows.map(row=>({...row,createdAt:row.createdAt.toISOString()})) as CodeProposalView['decisions']};
  }
  async prepare(binding:ConnectionBinding,actor:AuthUser,request:CorrectionRequest) {
    await assertManager(this.database,binding.projectId,actor);if(request.consent)await this.provider.ensureConnection(binding);
    if(this.closed)throw new CodeError('SERVICE_CLOSED');await assertManager(this.database,binding.projectId,actor);safeText(request.goal);if(!request.goal.trim())throw new CodeError('INVALID_REQUEST');
    const effort=request.reasoningEffort??null,{requestKey:ignored,...payload}=request,hash=fingerprint(payload);
    const prior=(await this.database.query<JobRow>('SELECT * FROM code_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,request.requestKey])).rows[0];if(prior){if(prior.request_hash!==hash)throw new CodeError('CONFLICT');return {id:prior.id,proposalId:prior.proposal_id,version:prior.version};}
    this.validateProvider(binding,request.model,effort,request.consent);
    const analysis=await this.analysis(binding.projectId,request.analysisId);if(analysis?.status!=='ready'||!analysis.source||!analysis.result)throw new CodeError('NO_SOURCE');
    if(new Set(analysis.result.findings.filter(item=>request.findingIds.includes(item.id)).map(item=>item.path)).size>3||!request.findingIds.length||request.findingIds.length>10||new Set(request.findingIds).size!==request.findingIds.length||request.findingIds.some(id=>!analysis.result!.findings.some(item=>item.id===id)))throw new CodeError('INVALID_CODE_SCOPE');
    await this.fresh(binding.projectId,analysis.source);
    let created=false;
    const job=await this.transaction(async client=>{
      await this.lock(client,binding.projectId,actor);const duplicate=(await client.query<JobRow>('SELECT * FROM code_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,request.requestKey])).rows[0];if(duplicate){if(duplicate.request_hash!==hash)throw new CodeError('CONFLICT');return duplicate;}
      await this.idle(client,binding.projectId);this.validateProvider(binding,request.model,effort,request.consent);
      if(fingerprint(await this.connection(client,binding.projectId))!==fingerprint(analysis.source!.connection))throw new CodeError('SOURCE_CHANGED');
      let proposalId=request.proposalId,version=1;
      if(proposalId){const latest=await this.versionRow(client,binding.projectId,proposalId,request.expectedVersion??0);if(request.purpose&&request.purpose!==latest.purpose)throw new CodeError('CONFLICT');if(latest.latest_version!==latest.version||!['changes_requested','invalidated','execution_failed'].includes(latest.state))throw new CodeError('CONFLICT');version=latest.version+1;await client.query('UPDATE code_proposals SET latest_version=$3 WHERE project_id=$1 AND id=$2',[binding.projectId,proposalId,version]);}
      else proposalId=(await client.query<{id:string}>('INSERT INTO code_proposals(project_id,created_by,purpose) VALUES($1,$2,$3) RETURNING id',[binding.projectId,actor.id,request.purpose??'demonstration'])).rows[0]!.id;
      await client.query('INSERT INTO code_versions(project_id,proposal_id,version,analysis_id,goal,finding_ids) VALUES($1,$2,$3,$4,$5,$6)',[binding.projectId,proposalId,version,request.analysisId,request.goal,JSON.stringify(request.findingIds)]);
      const result=(await client.query<JobRow>('INSERT INTO code_jobs(project_id,proposal_id,version,requested_by,request_key,request_hash,model,reasoning_effort) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[binding.projectId,proposalId,version,actor.id,request.requestKey,hash,request.model,effort])).rows[0]!;
      await this.audit(client,binding.projectId,actor,'code.prepare',proposalId,'started');created=true;return result;
    });
    if(created)this.launch(this.pipeline(binding,actor,job));return {id:job.id,proposalId:job.proposal_id,version:job.version};
  }
  async resume(binding:ConnectionBinding,actor:AuthUser,id:string,version:number,model:string,effort:ReasoningEffort|null,consent:boolean,key:string) {
    await assertManager(this.database,binding.projectId,actor);if(this.closed)throw new CodeError('SERVICE_CLOSED');
    if(consent)await this.provider.ensureConnection(binding);
    const hash=fingerprint({resume:true,id,version,model,effort,consent});
    const previous=(await this.database.query<JobRow>('SELECT * FROM code_jobs WHERE project_id=$1 AND requested_by=$2 AND request_key=$3',[binding.projectId,actor.id,key])).rows[0];if(previous){if(previous.request_hash!==hash)throw new CodeError('CONFLICT');return {id:previous.id,proposalId:previous.proposal_id,version:previous.version};}
    this.validateProvider(binding,model,effort,consent);const row=await this.versionRow(this.database,binding.projectId,id,version),analysis=await this.analysis(binding.projectId,row.analysis_id);if(!analysis?.source)throw new CodeError('NO_SOURCE');await this.ensureFresh(binding.projectId,actor,id,version,row);
    const job=await this.transaction(async client=>{await this.lock(client,binding.projectId,actor);await this.idle(client,binding.projectId);const latest=await this.versionRow(client,binding.projectId,id,version);if(latest.latest_version!==version||!['draft','pending_review','pending_policy_check'].includes(latest.state))throw new CodeError('CONFLICT');return (await client.query<JobRow>('INSERT INTO code_jobs(project_id,proposal_id,version,requested_by,request_key,request_hash,model,reasoning_effort) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[binding.projectId,id,version,actor.id,key,hash,model,effort])).rows[0]!;});
    this.launch(this.pipeline(binding,actor,job));return {id:job.id,proposalId:id,version};
  }
  private async stageTransaction(job:JobRow,actor:Actor,source:CodeSource,operation:(client:pg.PoolClient)=>Promise<void>) {
    await this.fresh(job.project_id,source);
    await this.transaction(async client=>{await this.lock(client,job.project_id,actor);const row=await this.versionRow(client,job.project_id,job.proposal_id,job.version);if(row.latest_version!==job.version||!['draft','pending_review','pending_policy_check'].includes(row.state))throw new CodeError('CONFLICT');if(fingerprint(await this.connection(client,job.project_id))!==fingerprint(source.connection))throw new CodeError('SOURCE_CHANGED');if(!(await client.query("SELECT id FROM code_jobs WHERE project_id=$1 AND id=$2 AND status='running'",[job.project_id,job.id])).rowCount)throw new CodeError('CONFLICT');await operation(client);});
  }
  private async pipeline(binding:ConnectionBinding,actor:AuthUser,job:JobRow) {
    let stage:AgentStage='executor',inputHash=fingerprint({jobId:job.id});
    try{
      const credentials=this.provider.connections.credentials(binding,job.model),row=await this.versionRow(this.database,job.project_id,job.proposal_id,job.version),analysis=await this.analysis(job.project_id,row.analysis_id);
      if(!analysis?.source||!analysis.result)throw new CodeError('NO_SOURCE');const source=analysis.source,findings=analysis.result.findings.filter(item=>row.finding_ids.includes(item.id));let candidate=row.candidate,hash=row.content_hash,state=row.state;
      for(stage of ['executor','reviewer','approver'] as const){
        const expected=stage==='executor'?'draft':stage==='reviewer'?'pending_review':'pending_policy_check';if(state!==expected)continue;
        await assertManager(this.database,job.project_id,actor);await this.fresh(job.project_id,source);
        if(this.closed||this.provider.connections.credentials(binding,job.model).entry!==credentials.entry)throw new CodeError('CONNECTION_CHANGED');
        const prior=(await this.database.query("SELECT output FROM code_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND stage='reviewer' AND status='succeeded'",[job.project_id,job.proposal_id,job.version])).rows[0];
        const input={schemaVersion:1,instructionsVersion:'code-agents-v2',recipient:stage,projectId:job.project_id,proposalId:job.proposal_id,version:job.version,jobId:job.id,source:modelSource(source),findings,goal:row.goal,contentHash:hash,candidate,priorReview:stage==='approver'?prior?.output??null:null,externalExecutionEnabled:false};inputHash=fingerprint(input);
        const response=await this.provider.generate(binding,actor,job.model,job.reasoning_effort,correctionInstructions(stage),JSON.stringify(input));
        if(this.closed||this.provider.connections.credentials(binding,job.model).entry!==credentials.entry)throw new CodeError('CONNECTION_CHANGED');
        let output:unknown,next:ProposalState;
        if(stage==='executor'){candidate=buildCandidate(response.output,source,findings);hash=fingerprint({schemaVersion:1,source,goal:row.goal,findingIds:row.finding_ids,candidate});output=candidate.correction;next=candidate.checks.some(check=>check.status==='fail')?'changes_requested':'pending_review';}
        else {const verdict=parseCodeVerdict(response.output,stage,hash!,candidate!);output=verdict;next=verdict.verdict==='validated'?'pending_policy_check':verdict.verdict==='human_required'?'pending_human_approval':verdict.verdict;}
        await this.stageTransaction(job,actor,source,async client=>{
          if(stage==='executor')await client.query('INSERT INTO code_candidates(project_id,proposal_id,version,content_hash,candidate) VALUES($1,$2,$3,$4,$5)',[job.project_id,job.proposal_id,job.version,hash,JSON.stringify(candidate)]);
          await client.query("INSERT INTO code_messages(project_id,proposal_id,version,job_id,stage,status,input_hash,output,duration_ms,usage,model,reasoning_effort) VALUES($1,$2,$3,$4,$5,'succeeded',$6,$7,$8,$9,$10,$11)",[job.project_id,job.proposal_id,job.version,job.id,stage,inputHash,JSON.stringify(output),response.durationMs,JSON.stringify(response.usage),job.model,job.reasoning_effort]);
          await client.query('UPDATE code_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[job.project_id,job.proposal_id,job.version,next]);await this.audit(client,job.project_id,actor,'code.agent.'+stage,job.id,'succeeded');
        });state=next;if(['changes_requested','rejected'].includes(state))break;
      }
      await this.database.query("UPDATE code_jobs SET status='succeeded',finished_at=clock_timestamp() WHERE id=$1 AND status='running'",[job.id]);
    }catch(error){await this.transaction(async client=>{const code=errorCode(error);if(code==='SOURCE_CHANGED')await client.query("UPDATE code_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND state IN ('draft','pending_review','pending_policy_check')",[job.project_id,job.proposal_id,job.version]);await client.query("UPDATE code_jobs SET status='failed',error_code=$2,finished_at=clock_timestamp() WHERE id=$1 AND status='running'",[job.id,code]);await client.query("INSERT INTO code_messages(project_id,proposal_id,version,job_id,stage,status,input_hash,error_code,model,reasoning_effort) VALUES($1,$2,$3,$4,$5,'failed',$6,$7,$8,$9)",[job.project_id,job.proposal_id,job.version,job.id,stage,inputHash,code,job.model,job.reasoning_effort]);await this.audit(client,job.project_id,null,'code.agent.'+stage,job.id,'failed');});}
  }
  private async ensureFresh(projectId:string,actor:Actor,id:string,version:number,row:VersionRow) {
    const analysis=await this.analysis(projectId,row.analysis_id);if(!analysis?.source)throw new CodeError('NO_SOURCE');
    try{await this.fresh(projectId,analysis.source);}catch(error){if(errorCode(error)==='SOURCE_CHANGED')await this.transaction(async client=>{await this.lock(client,projectId,actor);await client.query("UPDATE code_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND state NOT IN ('rejected','changes_requested','invalidated')",[projectId,id,version]);await this.audit(client,projectId,actor,'code.invalidate',id,'source_changed');});throw error;}return analysis.source;
  }
  async recheck(projectId:string,actor:AuthUser,id:string,version:number) {await assertManager(this.database,projectId,actor);const row=await this.versionRow(this.database,projectId,id,version);await this.ensureFresh(projectId,actor,id,version,row);return this.version(projectId,id,version);}
  async decide(projectId:string,actor:AuthUser,id:string,version:number,hash:string,decision:'approved'|'rejected'|'changes_requested',reason:string,key:string) {
    await assertManager(this.database,projectId,actor);safeText(reason);if(!reason.trim())throw new CodeError('REASON_REQUIRED');
    const duplicate=(await this.database.query('SELECT * FROM code_decisions WHERE project_id=$1 AND actor_id=$2 AND request_key=$3',[projectId,actor.id,key])).rows[0];if(duplicate){if(duplicate.proposal_id!==id||duplicate.version!==version||duplicate.content_hash!==hash||duplicate.decision!==decision||duplicate.reason!==reason)throw new CodeError('CONFLICT');return this.version(projectId,id,version);}
    const previous=await this.versionRow(this.database,projectId,id,version);if(previous.latest_version!==version||previous.state!=='pending_human_approval'||previous.content_hash!==hash)throw new CodeError('CONFLICT');
    const source=decision==='approved'?await this.ensureFresh(projectId,actor,id,version,previous):null;
    await this.transaction(async client=>{await this.lock(client,projectId,actor);await this.idle(client,projectId);const row=await this.versionRow(client,projectId,id,version);if(row.latest_version!==version||row.state!=='pending_human_approval'||row.content_hash!==hash)throw new CodeError('CONFLICT');
      if(decision==='approved'){if(fingerprint(await this.connection(client,projectId))!==fingerprint(source!.connection)||row.candidate?.checks.some(check=>check.status==='fail')||row.candidate?.correction.unresolvedQuestions.length)throw new CodeError('BLOCKING_CHECK');const messages=await client.query('SELECT stage,output FROM code_messages WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND status=\'succeeded\'',[projectId,id,version]);if(!messages.rows.some(item=>item.stage==='reviewer'&&item.output.contentHash===hash&&item.output.verdict==='validated')||!messages.rows.some(item=>item.stage==='approver'&&item.output.contentHash===hash&&item.output.verdict==='human_required'))throw new CodeError('MISSING_REVIEW');}
      await client.query('INSERT INTO code_decisions(project_id,proposal_id,version,actor_id,auth_version,request_key,content_hash,decision,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[projectId,id,version,actor.id,actor.auth_version,key,hash,decision,reason]);await client.query('UPDATE code_versions SET state=$4 WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[projectId,id,version,decision==='approved'?'authorized':decision]);await this.audit(client,projectId,actor,'code.decision',id,decision);
    });return this.version(projectId,id,version);
  }
  async withdraw(projectId:string,actor:AuthUser,id:string,version:number,reason:string) {
    safeText(reason);if(!reason.trim())throw new CodeError('REASON_REQUIRED');await this.transaction(async client=>{await this.lock(client,projectId,actor);await this.idle(client,projectId);const row=await this.versionRow(client,projectId,id,version);if(row.latest_version!==version||!['authorized','pending_human_approval','execution_failed'].includes(row.state))throw new CodeError('CONFLICT');await client.query("UPDATE code_versions SET state='invalidated' WHERE project_id=$1 AND proposal_id=$2 AND version=$3",[projectId,id,version]);await client.query("INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome,details) VALUES($1,'user',$2,'code.withdraw','code_review',$3,'invalidated',$4)",[projectId,actor.id,id,JSON.stringify({version,reason})]);});return this.version(projectId,id,version);
  }
  async simulate(projectId:string,actor:AuthUser,id:string,version:number,hash:string,key:string) {
    await assertManager(this.database,projectId,actor);
    const existing=(await this.database.query('SELECT * FROM code_publications WHERE project_id=$1 AND actor_id=$2 AND request_key=$3',[projectId,actor.id,key])).rows[0];if(existing){if(existing.proposal_id!==id||existing.version!==version||existing.content_hash!==hash)throw new CodeError('CONFLICT');return (await this.publications(projectId)).find(item=>item.id===existing.id)!;}
    const row=await this.versionRow(this.database,projectId,id,version);if(row.latest_version!==version||row.state!=='authorized'||row.content_hash!==hash||!row.candidate)throw new CodeError('CONFLICT');if(row.purpose!=='demonstration')throw new CodeError('DEMONSTRATION_ONLY');const source=await this.ensureFresh(projectId,actor,id,version,row);
    const plan={repository:`${source.connection.owner}/${source.connection.repository}`,baseBranch:source.connection.branch,baseSha:source.head,branch:`agent/${id}-v${version}`,contentHash:hash,title:`fix: apply reviewed proposal ${id} v${version}`,files:row.candidate.files.map(file=>({path:file.path,beforeBlob:source.files.find(original=>original.path===file.path)!.blobSha,afterBlob:file.blobSha})),body:`Proposal: ${id}\nVersion: ${version}\nContent hash: ${hash}\nBase commit: ${source.head}\n\nOnly the approved bounded patch would be published. Project builds and tests have not been executed. Human review and integration are required.\n\nSIMULATION ONLY: no GitHub branch, commit or pull request was created.`};
    const publication=await this.transaction(async client=>{await this.lock(client,projectId,actor);await this.idle(client,projectId);const latest=await this.versionRow(client,projectId,id,version);if(latest.latest_version!==version||latest.state!=='authorized'||latest.content_hash!==hash||fingerprint(await this.connection(client,projectId))!==fingerprint(source.connection))throw new CodeError('CONFLICT');const decision=(await client.query('SELECT actor_id,auth_version FROM code_decisions WHERE project_id=$1 AND proposal_id=$2 AND version=$3 AND content_hash=$4 AND decision=\'approved\'',[projectId,id,version,hash])).rows[0];if(!decision)throw new CodeError('MISSING_REVIEW');await assertManager(client,projectId,{id:decision.actor_id,auth_version:decision.auth_version});const already=(await client.query('SELECT id FROM code_publications WHERE project_id=$1 AND proposal_id=$2 AND version=$3',[projectId,id,version])).rows[0];if(already)return already.id as string;const inserted=(await client.query<{id:string}>('INSERT INTO code_publications(project_id,proposal_id,version,actor_id,request_key,content_hash,plan) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[projectId,id,version,actor.id,key,hash,JSON.stringify(plan)])).rows[0]!;await this.audit(client,projectId,actor,'code.publication.simulate',inserted.id,'simulated');return inserted.id;});
    return (await this.publications(projectId)).find(item=>item.id===publication)!;
  }
  async publications(projectId:string):Promise<CodePublicationView[]> {
    const rows=await this.database.query('SELECT * FROM code_publications WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[projectId]);return [...await publicationOverview(this.database,projectId),...rows.rows.map(row=>({id:row.id,proposalId:row.proposal_id,version:row.version,status:'simulated',errorCode:null,branch:row.plan.branch,commitSha:null,pullNumber:null,pullUrl:null,createdAt:row.created_at.toISOString(),finishedAt:row.created_at.toISOString(),integrationStatus:'not_requested',plan:row.plan,events:[{stage:'simulation',outcome:'simulated',errorCode:null,createdAt:row.created_at.toISOString()}]} as CodePublicationView))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
}
