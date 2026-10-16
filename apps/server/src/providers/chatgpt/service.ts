import type {ProviderEvaluation,ProviderCaseResult,ReasoningEffort} from '@dev-project-agent/contracts';
import type {JWTVerifyGetKey} from 'jose';
import type {AuthUser} from '../../modules/auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {assertManager} from '../../modules/supervision/access.js';
import {ChatGPTConnections,type ConnectionBinding} from './connection.js';
import {authorizationUrl,callbackCredentials,exchangeSignIn,inferJson,listModels,ProviderValidationError,supportedEfforts} from './validation.js';
import {caseInput,evaluationCases,evaluationInstructions,gradeCase,SUITE_VERSION} from './evaluation.js';
import {CredentialVault} from './vault.js';

export interface ChatGPTOptions {database:TrelloDatabase;callbackOrigin:string;fetcher?:typeof fetch;identityKey?:JWTVerifyGetKey;credentialKey?:Buffer;onFailure?:()=>void}
const safeCodes=new Set(['INVALID_STATE','AUTHORIZATION_DENIED','INVALID_CLIENT','MISSING_CODE','NO_PENDING_AUTHORIZATION','INVALID_ID_TOKEN','IDENTITY_MISMATCH','PLAN_PERMISSION_MISSING','NO_AVAILABLE_MODELS','AUTHORIZATION_EXPIRED','USAGE_LIMIT','INFERENCE_FAILED','INCOMPLETE_STREAM','INVALID_STREAM','INVALID_MODEL_OUTPUT','RESPONSE_TOO_LARGE','INFERENCE_UNAVAILABLE','PROVIDER_UNAVAILABLE','INVALID_RESPONSE','CONNECTION_REQUIRED','MODEL_NOT_AVAILABLE','AUTHORIZATION_CANCELLED','INVALID_TOKEN_LIFETIME','CONFLICT','CONNECTION_CAPACITY']);
export function providerCode(error:unknown) {
  return error instanceof ProviderValidationError&&(safeCodes.has(error.code)||['INFERENCE_TIMEOUT','INPUT_TOO_LARGE','INVALID_REQUEST','UNSUPPORTED_EFFORT','REFRESH_UNCERTAIN','REFRESH_IN_PROGRESS','REFRESH_UNAVAILABLE','REFRESH_REAUTHORIZATION_REQUIRED','CREDENTIAL_STORAGE_UNAVAILABLE'].includes(error.code))?error.code:
    error&&typeof error==='object'&&'code' in error&&error.code==='FORBIDDEN'?'FORBIDDEN':'PROVIDER_UNAVAILABLE';
}
interface Registration {host_id:string;client_id:string|null;subject:string|null}
const selection=`SELECT e.id,e.provider,e.model,e.reasoning_effort AS "reasoningEffort",e.suite_version AS "suiteVersion",e.status,e.created_at AS "createdAt",e.finished_at AS "finishedAt",e.error_code AS "errorCode",r.result FROM provider_evaluations e LEFT JOIN provider_evaluation_results r ON r.evaluation_id=e.id AND r.project_id=e.project_id`;
const view=(row:ProviderEvaluation):ProviderEvaluation=>({...row,createdAt:new Date(row.createdAt).toISOString(),finishedAt:row.finishedAt?new Date(row.finishedAt).toISOString():null});

export class ChatGPTService {
  readonly connections=new ChatGPTConnections();
  private tasks=new Set<Promise<void>>();
  private timer:ReturnType<typeof setInterval>;
  private closed=false;
  readonly vault:CredentialVault|null;
  private renewal:Promise<void>|null=null;
  constructor(readonly options:ChatGPTOptions) {
    const url=new URL(options.callbackOrigin);
    if(url.origin!==options.callbackOrigin||url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('ChatGPT callbacks require a configured loopback origin.');
    this.vault=options.credentialKey?new CredentialVault(options.database,options.credentialKey,options.fetcher):null;
    this.timer=setInterval(()=>{this.connections.sweep();if(this.vault&&!this.closed&&!this.renewal){this.renewal=this.vault.renewAll().catch(()=>options.onFailure?.()).finally(()=>{this.renewal=null;});}},30_000);this.timer.unref();
  }
  async initialize() {
    await this.vault?.recover();
    // A single local service owns this milestone. Do not replay an interrupted quota-consuming evaluation.
    await this.options.database.query(`WITH interrupted AS (UPDATE provider_evaluations SET status='interrupted',finished_at=clock_timestamp(),error_code='SERVICE_RESTARTED' WHERE status='running' AND provider='chatgpt' RETURNING id,project_id)
      INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) SELECT project_id,'system',NULL,'provider.recovery','provider',id::text,'failed' FROM interrupted`);
  }
  async audit(binding:ConnectionBinding,action:string,outcome:string,resourceId:string) {
    await this.options.database.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,'user',$2,$3,'provider',$4,$5)",[binding.projectId,binding.userId,action,resourceId,outcome]);
  }
  async authorize(binding:ConnectionBinding) {
    await assertManager(this.options.database,binding.projectId,{id:binding.userId,auth_version:binding.authVersion});
    await this.vault?.clear(binding);this.connections.disconnectAccount(binding);
    const registration=(await this.options.database.query<Registration>(`INSERT INTO chatgpt_registrations (project_id,user_id) VALUES ($1,$2) ON CONFLICT (project_id,user_id) DO UPDATE SET host_id=chatgpt_registrations.host_id RETURNING host_id,client_id,subject`,[binding.projectId,binding.userId])).rows[0]!;
    const redirectUri=`${this.options.callbackOrigin}/api/v1/projects/${binding.projectId}/chatgpt/callback`;
    const attempt=this.connections.begin(binding,redirectUri,registration.client_id,registration.subject);
    try{await this.audit(binding,'provider.authorize','requested',binding.projectId);}
    catch(error){this.connections.disconnect(binding);throw error;}
    return {authorizationUrl:authorizationUrl(attempt,'urn:uuid:'+registration.host_id).toString(),expiresAt:this.connections.view(binding).expiresAt};
  }
  async callback(binding:ConnectionBinding,url:URL) {
    const attempt=this.connections.pending(binding);
    // An incorrect state must not consume the legitimate manager's pending attempt.
    let credentials:ReturnType<typeof callbackCredentials>;
    try{credentials=callbackCredentials(url,attempt);}
    catch(error){if(providerCode(error)!=='INVALID_STATE'){const consumed=this.connections.consume(binding);this.connections.fail(binding,consumed.entry,providerCode(error));await this.audit(binding,'provider.connect','failed',binding.projectId);}throw error;}
    const consumed=this.connections.consume(binding);
    try{
      const identity=await exchangeSignIn(attempt,credentials,this.options.fetcher,this.options.identityKey);
      if(identity.expiresIn===null)throw new ProviderValidationError('INVALID_TOKEN_LIFETIME');
      const tokenExpiresAt=Date.now()+identity.expiresIn*1000;
      const models=await listModels(identity.accessToken,this.options.fetcher);
      await assertManager(this.options.database,binding.projectId,{id:binding.userId,auth_version:binding.authVersion});
      if(consumed.entry.controller.signal.aborted)throw new ProviderValidationError('AUTHORIZATION_CANCELLED');
      await this.options.database.query('UPDATE chatgpt_registrations SET client_id=$3,subject=$4 WHERE project_id=$1 AND user_id=$2',[binding.projectId,binding.userId,credentials.clientId,identity.subject]);
      await this.audit(binding,'provider.connect','succeeded',binding.projectId);
      if(this.vault&&identity.refreshToken)await this.vault.save(binding,{accessToken:identity.accessToken,refreshToken:identity.refreshToken,clientId:credentials.clientId,subject:identity.subject},tokenExpiresAt,models,identity.earliestRefreshAt);
      if(consumed.entry.controller.signal.aborted){await this.vault?.clear(binding);throw new ProviderValidationError('AUTHORIZATION_CANCELLED');}
      this.connections.complete(binding,consumed.entry,identity.accessToken,(tokenExpiresAt-Date.now())/1000,models);
    }catch(error){this.connections.fail(binding,consumed.entry,providerCode(error));await this.audit(binding,'provider.connect','failed',binding.projectId);throw error;}
  }
  async overview(binding:ConnectionBinding,manager:boolean) {
    let renewalError:string|null=null;
    if(manager)try{await this.ensureConnection(binding);}catch(error){renewalError=providerCode(error);}
    const rows=await this.options.database.query<ProviderEvaluation>(selection+" WHERE e.project_id=$1 AND (e.provider='chatgpt' OR e.provider IS NULL) ORDER BY e.created_at DESC,e.id DESC LIMIT 20",[binding.projectId]);
    const connection=manager?this.connections.view(binding):{status:'disconnected' as const,expiresAt:null,errorCode:null,models:[]};
    const metadata=manager&&this.vault?await this.vault.metadata(binding):{renewable:false,retryAt:null,lastRefreshedAt:null};
    return {connection:{...connection,...(renewalError?{errorCode:renewalError}:{}),...metadata},evaluations:rows.rows.map(view)};
  }
  async ensureConnection(binding:ConnectionBinding) {
    if(this.closed)throw new ProviderValidationError('PROVIDER_UNAVAILABLE');
    if(this.connections.view(binding).status==='pending'||!this.vault)return;
    try{const row=await this.vault.ensure(binding);if(row)this.connections.restore(binding,this.vault.tokens(binding,row).accessToken,row.expires_at.getTime(),row.models);}
    catch(error){if(['REFRESH_REAUTHORIZATION_REQUIRED','REFRESH_UNCERTAIN','PLAN_PERMISSION_MISSING','FORBIDDEN','INVALID_CLIENT','CREDENTIAL_STORAGE_UNAVAILABLE'].includes(providerCode(error)))this.connections.disconnectAccount(binding);throw error;}
  }
  async disconnect(binding:ConnectionBinding) {
    this.connections.disconnectAccount(binding);const confirmed=await this.vault?.disconnect(binding)??false;
    await this.audit(binding,'provider.disconnect',confirmed?'succeeded':'failed',binding.projectId);return {remoteRevocationConfirmed:confirmed};
  }
  async generate(binding:ConnectionBinding,actor:AuthUser,model:string,effort:ReasoningEffort|null,instructions:string,input:string) {
    await assertManager(this.options.database,binding.projectId,actor);
    await this.ensureConnection(binding);
    const before=this.connections.credentials(binding,model);
    const response=await inferJson(before.token,model,instructions,input,this.options.fetcher,before.signal,effort);
    await assertManager(this.options.database,binding.projectId,actor);
    if(this.connections.credentials(binding,model).entry!==before.entry)throw new ProviderValidationError('AUTHORIZATION_CANCELLED');
    return response;
  }
  async evaluate(binding:ConnectionBinding,actor:AuthUser,model:string,requestKey:string,effort:ReasoningEffort|null=null) {
    if(this.closed)throw new ProviderValidationError('PROVIDER_UNAVAILABLE');
    await this.ensureConnection(binding);
    const database=this.options.database,client=await database.connect();let row:ProviderEvaluation,created=false;
    try{
      await client.query('BEGIN');await assertManager(client,binding.projectId,actor);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['provider-evaluation:'+binding.projectId]);
      const previous=await client.query<ProviderEvaluation>(selection+' WHERE e.project_id=$1 AND e.requested_by=$2 AND e.request_key=$3',[binding.projectId,actor.id,requestKey]);
      if(previous.rows[0]){
        if(previous.rows[0].provider!=='chatgpt'||previous.rows[0].model!==model||previous.rows[0].reasoningEffort!==effort)throw new ProviderValidationError('CONFLICT');row=previous.rows[0];
      }else{
        this.connections.credentials(binding,model);
        if(effort&&!supportedEfforts(model).includes(effort))throw new ProviderValidationError('UNSUPPORTED_EFFORT');
        const active=await client.query("SELECT id FROM provider_evaluations WHERE project_id=$1 AND status='running'",[binding.projectId]);
        if(active.rows.length)throw new ProviderValidationError('CONFLICT');
        const inserted=await client.query<{id:string}>("INSERT INTO provider_evaluations (project_id,requested_by,request_key,model,suite_version,status,reasoning_effort,provider) VALUES ($1,$2,$3,$4,$5,'running',$6,'chatgpt') RETURNING id",[binding.projectId,actor.id,requestKey,model,SUITE_VERSION,effort]);
        row=(await client.query<ProviderEvaluation>(selection+' WHERE e.id=$1',[inserted.rows[0]!.id])).rows[0]!;
        await client.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,'user',$2,'provider.evaluate','provider',$3,'requested')",[binding.projectId,actor.id,row.id]);created=true;
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    if(created){const task=this.runEvaluation(binding,actor,row!.id,model,effort).catch(()=>{this.options.onFailure?.();});this.tasks.add(task);void task.then(()=>this.tasks.delete(task));}
    return view(row!);
  }
  private async runEvaluation(binding:ConnectionBinding,actor:AuthUser,id:string,model:string,effort:ReasoningEffort|null) {
    const cases:ProviderCaseResult[]=[];let errorCode:string|null=null;
    let initial:ReturnType<ChatGPTConnections['credentials']>|null=null;
    try{
      initial=this.connections.credentials(binding,model);
      for(const test of evaluationCases){
        await assertManager(this.options.database,binding.projectId,actor);
        await this.ensureConnection(binding);
        const current=this.connections.credentials(binding,model);if(current.entry!==initial.entry)throw new ProviderValidationError('AUTHORIZATION_CANCELLED');
        const response=await inferJson(current.token,model,evaluationInstructions,caseInput(test),this.options.fetcher,current.signal,effort);
        await assertManager(this.options.database,binding.projectId,actor);
        const after=this.connections.credentials(binding,model);if(after.entry!==initial.entry)throw new ProviderValidationError('AUTHORIZATION_CANCELLED');
        cases.push(gradeCase(test,response.output,response.durationMs,response.usage as Record<string,number>|null));
      }
    }catch(error){
      errorCode=providerCode(error);
      if(errorCode==='AUTHORIZATION_EXPIRED'&&initial)this.connections.fail(binding,initial.entry,errorCode);
    }
    const result={cases,passed:cases.filter(value=>value.passed).length,total:evaluationCases.length,requiresHumanReview:true,productionReady:false};
    if(this.closed)errorCode='SERVICE_STOPPED';
    const status=this.closed?'interrupted':!errorCode&&cases.length===evaluationCases.length&&cases.every(value=>value.passed)?'passed':'failed';
    const client=await this.options.database.connect();
    try{
      await client.query('BEGIN');
      const updated=await client.query("UPDATE provider_evaluations SET status=$2,finished_at=clock_timestamp(),error_code=$3 WHERE id=$1 AND status='running' RETURNING id",[id,status,errorCode]);
      if(updated.rows.length){
        await client.query('INSERT INTO provider_evaluation_results (evaluation_id,project_id,result) VALUES ($1,$2,$3)',[id,binding.projectId,JSON.stringify(result)]);
        await client.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,'user',$2,'provider.evaluate','provider',$3,$4)",[binding.projectId,actor.id,id,status==='passed'?'succeeded':'failed']);
      }
      await client.query('COMMIT');
    }catch{await client.query('ROLLBACK');this.options.onFailure?.();}finally{client.release();}
  }
  async waitForIdle() {await Promise.allSettled(this.tasks);}
  async close() {this.closed=true;clearInterval(this.timer);this.connections.close();await this.waitForIdle();await this.renewal;await this.vault?.close();}
}
