import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildApp} from '../../app.js';
import type {AuthUser} from '../auth/repository.js';
import {hashPassword} from '../auth/password.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {ChatGPTService} from '../../providers/chatgpt/service.js';
import type {ConnectionBinding} from '../../providers/chatgpt/connection.js';
import {CodeReviewService,type CorrectionRequest} from './service.js';
import {codeFixture,codeSourceFetcher,syntheticCodeVerdict,syntheticCorrection,syntheticHead} from './fixtures.js';
import {deterministicAnalysis} from './evidence.js';

describe.skipIf(process.env.RUN_CODE_DB_TESTS!=='true')('PostgreSQL pinned code review and simulated publication',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,provider:ChatGPTService,service:CodeReviewService,app:ReturnType<typeof buildApp>,projectId:string,actor:AuthUser,binding:ConnectionBinding,analysisId:string;
  let headers:Record<string,string>,viewerHeaders:Record<string,string>,calls:string[]=[],head=syntheticHead,mode='ok',pause:Promise<void>|null=null,started:()=>void=()=>{};
  const origin='http://127.0.0.1:5174',name='code-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');let readCalls=0;
  const sourceFetcher:typeof fetch=async(input,options)=>{expect(options?.method??'GET').toBe('GET');expect(new URL(String(input)).hostname).toBe('api.github.com');readCalls++;const response=await codeSourceFetcher(input,options);if(String(input).includes('/commits/'))return Response.json({...await response.json(),sha:head});return response;};
  const fetcher:typeof fetch=async(input,options)=>{
    expect(new URL(String(input)).hostname).toBe('api.openai.com');expect(options?.method).toBe('POST');const body=JSON.parse(String(options?.body)),data=JSON.parse(body.input[0].content);expect(body.reasoning).toEqual({effort:'high'});expect(body).not.toHaveProperty('tools');expect(data.source).not.toHaveProperty('inventory');calls.push(data.recipient);
    if(pause){started();await pause;}if(mode==='quota'&&data.recipient==='reviewer')return new Response('PRIVATE_UPSTREAM',{status:429});
    let output:unknown;
    if(data.recipient==='code_analyst'){const {id:ignored,origin:ignoredOrigin,confidence:ignoredConfidence,...finding}=deterministicAnalysis(codeFixture()).findings[0]!;output={summary:'Revisar la interpretación de contenido.',findings:[finding],limitations:['Se desconocen los llamadores.']};}
    else if(data.recipient==='executor')output=syntheticCorrection(data.source,data.findings);
    else output=syntheticCodeVerdict(data.recipient,data.contentHash);
    if(mode==='adjust'&&data.recipient==='reviewer')output={...output as object,verdict:'changes_requested',issues:['Aclarar el contrato de entradas.']};
    if(mode==='unsafe'&&data.recipient==='approver')output={...output as object,verdict:'policy_allowed'};
    if(mode==='bad-evidence'&&data.recipient==='executor'){const value=output as ReturnType<typeof syntheticCorrection>;value.edits[0]!.before='not the original';}
    return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(output)})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:50,output_tokens:30,total_tokens:80}}})+'\n\n');
  };
  const path=()=>`/api/v1/projects/${projectId}/code-review`;
  const cookie=(response:{headers:Record<string,unknown>})=>{const values=response.headers['set-cookie'];return (Array.isArray(values)?values:[values]).reverse().find(value=>typeof value==='string'&&value.startsWith('dpa_session='))?.split(';')[0] as string;};
  async function login(role:string){const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});const response=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:name+'-'+role,password}});expect(response.statusCode).toBe(200);return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};}
  function connect(){provider.connections.begin(binding,'http://127.0.0.1/callback','oaiapp_test','synthetic');const consumed=provider.connections.consume(binding);provider.connections.complete(binding,consumed.entry,'SYNTHETIC_ACCESS',3600,[{slug:'gpt-6.1-sol',displayName:'Synthetic model',reasoningEfforts:['low','medium','high','xhigh','max']}]);}
  const analyzeRequest=()=>({paths:['src/parse.ts'],expectedHead:syntheticHead,mode:'files' as const,withAi:false,requestKey:randomUUID()});
  const request=():CorrectionRequest=>({analysisId,findingIds:deterministicAnalysis(codeFixture()).findings.map(item=>item.id),goal:'Usar un formato JSON limitado y conservar las comprobaciones pendientes.',model:'gpt-6.1-sol',reasoningEffort:'high',consent:true,requestKey:randomUUID()});
  async function prepare(extra:Partial<CorrectionRequest>={}) {const payload={...request(),...extra},job=await service.prepare(binding,actor,payload);await service.waitForIdle();return {job,payload,detail:await service.version(projectId,job.proposalId,job.version)};}
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    let queue:Promise<void>=Promise.resolve();const query=(sql:string,values?:unknown[])=>{const result=queue.then(()=>client.query(sql,values));queue=result.then(()=>{},()=>{});return result;};
    database={query,connect:async()=>({query:async(sql:string,values?:unknown[])=>{if(sql==='BEGIN')return query('SAVEPOINT code_test');if(sql==='COMMIT')return query('RELEASE SAVEPOINT code_test');if(sql==='ROLLBACK'){await query('ROLLBACK TO SAVEPOINT code_test');return query('RELEASE SAVEPOINT code_test');}return query(sql,values);},release:()=>{}})} as unknown as TrelloDatabase;
    projectId=(await client.query("INSERT INTO projects(name) VALUES('Code review verification') RETURNING id")).rows[0].id;
    await client.query('INSERT INTO github_connections(project_id,owner,repository,branch) VALUES($1,$2,$3,$4)',[projectId,'example','project','develop']);
    const hash=await hashPassword(password);for(const role of ['manager','viewer']){const user=(await client.query<AuthUser>('INSERT INTO users(login,display_name,password_hash) VALUES($1,$2,$3) RETURNING *',[name+'-'+role,role,hash])).rows[0]!;await client.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[projectId,user.id,role]);if(role==='manager')actor=user;}
    provider=new ChatGPTService({database,callbackOrigin:'http://127.0.0.1:3100',fetcher});binding={projectId,userId:actor.id,authVersion:actor.auth_version,sessionId:'synthetic-code-session'};connect();service=new CodeReviewService(database,provider,null,sourceFetcher);await service.initialize();
    app=buildApp({checkDatabase:async()=>{},auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,chatgpt:provider,codeReview:service}});headers=await login('manager');viewerHeaders=await login('viewer');
    analysisId=(await service.analyze(binding,actor,analyzeRequest())).id;
  });
  afterAll(async()=>{if(provider)await provider.close();if(service)await service.close();if(app)await app.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  it('protects sessions, membership, manager actions, CSRF, origin and mutation schemas',async()=>{
    expect((await app.inject({method:'GET',url:path()})).statusCode).toBe(401);expect((await app.inject({method:'GET',url:`/api/v1/projects/${randomUUID()}/code-review`,headers})).statusCode).toBe(404);
    expect((await app.inject({method:'GET',url:path()+'/catalog',headers:viewerHeaders})).statusCode).toBe(403);expect((await app.inject({method:'POST',url:path()+'/analyses',headers:viewerHeaders,payload:analyzeRequest()})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path()+'/analyses',headers:{origin,cookie:headers.cookie},payload:analyzeRequest()})).statusCode).toBe(403);expect((await app.inject({method:'POST',url:path()+'/analyses',headers:{...headers,origin:'https://evil.example'},payload:analyzeRequest()})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path()+'/proposals',headers,payload:{...request(),purpose:'live'}})).statusCode).toBe(400);
  });
  it('makes local analysis available without provider calls and deduplicates exact requests',async()=>{
    const payload=analyzeRequest(),before=calls.length,analysis=await service.analyze(binding,actor,payload);expect((await service.analyze(binding,actor,payload)).id).toBe(analysis.id);expect(calls.length).toBe(before);expect((await service.analysis(projectId,analysis.id))?.result?.findings[0]?.confidence).toBe('hypothesis');await expect(service.analyze(binding,actor,{...payload,withAi:true})).rejects.toMatchObject({code:'CONFLICT'});
    expect((await app.inject({method:'GET',url:path()+'/analyses/'+analysis.id,headers:viewerHeaders})).statusCode).toBe(200);
  });
  it('requires explicit consent before sending code and grounds AI findings in exact evidence',async()=>{
    await expect(service.analyze(binding,actor,{...analyzeRequest(),withAi:true,model:'gpt-6.1-sol',reasoningEffort:'high'})).rejects.toMatchObject({code:'CONSENT_REQUIRED'});
    const value=await service.analyze(binding,actor,{...analyzeRequest(),withAi:true,model:'gpt-6.1-sol',reasoningEffort:'high',consent:true});await service.waitForIdle();expect((await service.analysis(projectId,value.id))?.result?.findings[0]).toMatchObject({origin:'model',confidence:'hypothesis',evidence:'  return eval(input);'});await expect(service.prepare(binding,actor,{...request(),consent:false})).rejects.toMatchObject({code:'CONSENT_REQUIRED'});
  });
  it('runs three sequential agents, seals the patch and deduplicates without another inference',async()=>{
    calls=[];const first=await prepare();expect(calls).toEqual(['executor','reviewer','approver']);expect(first.detail.state).toBe('pending_human_approval');expect(first.detail.messages).toHaveLength(3);expect(first.detail.candidate?.patch).toContain('+  return JSON.parse(input);');expect(first.detail.contentHash).toMatch(/^[a-f0-9]{64}$/);expect(first.detail.purpose).toBe('demonstration');expect((await service.prepare(binding,actor,first.payload)).id).toBe(first.job.id);expect(calls).toHaveLength(3);await expect(service.prepare(binding,actor,{...first.payload,goal:'Changed goal'})).rejects.toMatchObject({code:'CONFLICT'});
    await expect(service.decide(projectId,actor,first.job.proposalId,1,'0'.repeat(64),'approved','Revisada.',randomUUID())).rejects.toMatchObject({code:'CONFLICT'});await expect(service.simulate(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,randomUUID())).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('stores the human decision and a simulation with no external write or integration',async()=>{
    const first=await prepare(),key=randomUUID();await service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','Diff revisado; simulación únicamente.',key);expect((await service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','Diff revisado; simulación únicamente.',key)).decisions).toHaveLength(1);
    const simulationKey=randomUUID(),simulation=await service.simulate(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,simulationKey);expect(simulation).toMatchObject({status:'simulated',branch:`agent/${first.job.proposalId}-v1`,commitSha:null,pullNumber:null,integrationStatus:'not_requested'});expect(simulation.plan?.baseSha).toBe(syntheticHead);expect((await service.simulate(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,simulationKey)).id).toBe(simulation.id);expect((await service.overview(projectId)).writesEnabled).toBe(false);expect(readCalls).toBeGreaterThan(0);
    await service.withdraw(projectId,actor,first.job.proposalId,1,'Demostración terminada.');await expect(service.simulate(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,randomUUID())).rejects.toMatchObject({code:'CONFLICT'});expect((await service.version(projectId,first.job.proposalId,1)).decisions).toHaveLength(1);
  });
  it('preserves older versions and repeats every review after requested changes',async()=>{
    mode='adjust';const first=await prepare();expect(first.detail.state).toBe('changes_requested');const sealed=JSON.stringify(first.detail);mode='ok';calls=[];const second=await prepare({proposalId:first.job.proposalId,expectedVersion:1});expect(second.detail.version).toBe(2);expect(calls).toEqual(['executor','reviewer','approver']);expect(second.detail.decisions).toEqual([]);expect((await service.version(projectId,first.job.proposalId,1)).candidate).toEqual(JSON.parse(sealed).candidate);await expect(service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','Reviewed.',randomUUID())).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('records rejection and adjustment reasons without inheriting permission',async()=>{
    const first=await prepare();await expect(service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'changes_requested','',randomUUID())).rejects.toMatchObject({code:'REASON_REQUIRED'});expect((await service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'changes_requested','Aclarar contrato.',randomUUID())).state).toBe('changes_requested');const second=await prepare({proposalId:first.job.proposalId,expectedVersion:1});expect((await service.decide(projectId,actor,first.job.proposalId,2,second.detail.contentHash!,'rejected','No se adapta al contrato.',randomUUID())).state).toBe('rejected');await expect(service.prepare(binding,actor,{...request(),proposalId:first.job.proposalId,expectedVersion:2})).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('does not accept fabricated original code or automated external approval',async()=>{
    mode='bad-evidence';const bad=await prepare();expect(bad.detail.candidate).toBeNull();expect(bad.detail.messages.at(-1)?.errorCode).toBe('INVALID_CODE_EVIDENCE');mode='unsafe';const unsafe=await prepare();expect(unsafe.detail.state).toBe('pending_policy_check');expect(unsafe.detail.messages.at(-1)?.errorCode).toBe('INVALID_CODE_VERDICT');mode='ok';calls=[];await service.resume(binding,actor,unsafe.job.proposalId,1,'gpt-6.1-sol','high',true,randomUUID());await service.waitForIdle();expect(calls).toEqual(['approver']);
  });
  it('resumes only the pending stage after quota or restart and preserves the sealed hash',async()=>{
    mode='quota';const first=await prepare();expect(first.detail.state).toBe('pending_review');expect(first.detail.messages.at(-1)?.errorCode).toBe('USAGE_LIMIT');mode='ok';await client.query("UPDATE code_jobs SET status='running' WHERE id=$1",[first.job.id]);const before=calls.length;await service.initialize();expect(calls.length).toBe(before);expect((await service.overview(projectId)).jobs.find(item=>item.id===first.job.id)?.status).toBe('interrupted');calls=[];const key=randomUUID();await service.resume(binding,actor,first.job.proposalId,1,'gpt-6.1-sol','high',true,key);await service.waitForIdle();expect(calls).toEqual(['reviewer','approver']);expect((await service.version(projectId,first.job.proposalId,1)).contentHash).toBe(first.detail.contentHash);await service.resume(binding,actor,first.job.proposalId,1,'gpt-6.1-sol','high',true,key);expect(calls).toHaveLength(2);
  });
  it('invalidates approval when the remote HEAD changes and refuses to reuse its source',async()=>{
    const first=await prepare();head='c'.repeat(40);try{await expect(service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','Reviewed.',randomUUID())).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect((await service.version(projectId,first.job.proposalId,1)).state).toBe('invalidated');expect((await service.version(projectId,first.job.proposalId,1)).decisions).toEqual([]);await expect(service.prepare(binding,actor,request())).rejects.toMatchObject({code:'SOURCE_CHANGED'});}finally{head=syntheticHead;}
  });
  it('invalidates a pending stage when its source changes before an explicit resume',async()=>{
    mode='quota';const first=await prepare();mode='ok';head='c'.repeat(40);const before=calls.length;
    try{await expect(service.resume(binding,actor,first.job.proposalId,1,'gpt-6.1-sol','high',true,randomUUID())).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect((await service.version(projectId,first.job.proposalId,1)).state).toBe('invalidated');expect(calls.length).toBe(before);}finally{head=syntheticHead;}
  });
  it('blocks late responses after a source change, disconnection or permission loss',async()=>{
    for(const condition of ['source','connection','permission']){
      let release:()=>void=()=>{};const began=new Promise<void>(resolve=>{started=resolve;});pause=new Promise<void>(resolve=>{release=resolve;});const job=await service.prepare(binding,actor,request());await began;await expect(service.prepare(binding,actor,request())).rejects.toMatchObject({code:'CONFLICT'});
      if(condition==='source')head='c'.repeat(40);if(condition==='connection')provider.connections.disconnect(binding);if(condition==='permission')await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);pause=null;release();await service.waitForIdle();expect((await service.version(projectId,job.proposalId,1)).candidate).toBeNull();head=syntheticHead;if(condition==='connection')connect();if(condition==='permission')await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);
    }
  });
  it('blocks simulation after the approving manager auth version changes',async()=>{
    const first=await prepare();await service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','Reviewed.',randomUUID());await client.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[actor.id]);const current={...actor,auth_version:actor.auth_version+1};try{await expect(service.simulate(projectId,current,first.job.proposalId,1,first.detail.contentHash!,randomUUID())).rejects.toMatchObject({code:'FORBIDDEN'});}finally{await client.query('UPDATE users SET auth_version=auth_version-1 WHERE id=$1',[actor.id]);}
  });
  it('runs the full workflow with the restricted role and preserves append-only evidence',async()=>{
    await client.query('SET LOCAL ROLE dev_project_agent_app');try{const first=await prepare();await service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','Reviewed.',randomUUID());expect((await service.simulate(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,randomUUID())).status).toBe('simulated');}finally{await client.query('RESET ROLE');}
    const grants=(await client.query("SELECT has_column_privilege('dev_project_agent_app','code_versions','state','UPDATE') AS state,has_column_privilege('dev_project_agent_app','code_versions','goal','UPDATE') AS goal,has_table_privilege('dev_project_agent_app','code_candidates','UPDATE') AS candidate,has_table_privilege('dev_project_agent_app','code_messages','DELETE') AS messages,has_table_privilege('dev_project_agent_app','code_decisions','UPDATE') AS decisions,has_table_privilege('dev_project_agent_app','code_publications','UPDATE') AS publications")).rows[0];expect(grants).toEqual({state:true,goal:false,candidate:false,messages:false,decisions:false,publications:false});expect(JSON.stringify(await service.overview(projectId))).not.toMatch(/SYNTHETIC_ACCESS|PRIVATE_UPSTREAM/);
  });
});
