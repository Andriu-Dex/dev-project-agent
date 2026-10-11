import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildApp} from '../../app.js';
import {hashPassword} from '../auth/password.js';
import type {AuthUser} from '../auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {boardFixture,boardId,listId} from '../../integrations/trello/fixtures.js';
import {claimJob,enqueueJob,getJob} from '../supervision/jobs.js';
import {executeJob,type SupervisionOptions} from '../supervision/worker.js';
import {ChatGPTService} from '../../providers/chatgpt/service.js';
import type {ConnectionBinding} from '../../providers/chatgpt/connection.js';
import {ProposalService} from './service.js';
import {syntheticContent,syntheticVerdict} from './fixtures.js';

describe.skipIf(process.env.RUN_PROPOSALS_DB_TESTS!=='true')('PostgreSQL three-agent proposal workflow',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,app:ReturnType<typeof buildApp>,provider:ChatGPTService,service:ProposalService,projectId:string,actor:AuthUser,binding:ConnectionBinding,runId:string,options:SupervisionOptions;
  let headers:Record<string,string>,viewerHeaders:Record<string,string>,calls:string[]=[],mode='ok',pause:Promise<void>|null=null,started:()=>void=()=>{};
  const board=boardFixture(),origin='http://127.0.0.1:5174',loginName='proposal-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
  const sourceFetcher:typeof fetch=async(input,request)=>{expect(request?.method??'GET').toBe('GET');const url=new URL(String(input));return Response.json(url.pathname.endsWith('/lists')?board.lists:url.pathname.endsWith('/members')?board.members:url.pathname.endsWith('/cards')?board.cards:url.pathname.endsWith('/checklists')?[]:board);};
  const fetcher:typeof fetch=async(input,request)=>{
    expect(new URL(String(input)).hostname).toBe('api.openai.com');expect(request?.method).toBe('POST');const body=JSON.parse(String(request!.body));expect(body.reasoning).toEqual({effort:'high'});expect(body).not.toHaveProperty('tools');
    const data=JSON.parse(body.input[0].content);expect(JSON.stringify(data)).not.toMatch(/password_hash|idMembers|description|SYNTHETIC_ACCESS/);calls.push(data.recipient);
    if(pause){started();await pause;}if(mode==='quota'&&data.recipient==='reviewer')return new Response('PRIVATE_UPSTREAM',{status:429});
    let output=data.recipient==='executor'?syntheticContent(data):syntheticVerdict(data.recipient,data.contentHash);
    if(mode==='adjust'&&data.recipient==='reviewer')output={...output,verdict:'changes_requested',issues:['Aclarar el objetivo antes de aprobar.']};
    if(mode==='unsafe'&&data.recipient==='approver')output={...output,verdict:'policy_allowed'};
    return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(output)})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:50,output_tokens:30,total_tokens:80}}})+'\n\n');
  };
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    let queue:Promise<void>=Promise.resolve();const query=(sql:string,values?:unknown[])=>{const result=queue.then(()=>client.query(sql,values));queue=result.then(()=>{},()=>{});return result;};
    database={query,connect:async()=>({query:async(sql:string,values?:unknown[])=>{if(sql.startsWith('BEGIN'))return query('SAVEPOINT proposals_test');if(sql==='COMMIT')return query('RELEASE SAVEPOINT proposals_test');if(sql==='ROLLBACK'){await query('ROLLBACK TO SAVEPOINT proposals_test');return query('RELEASE SAVEPOINT proposals_test');}return query(sql,values);},release:()=>{}})} as unknown as TrelloDatabase;
    projectId=(await client.query("INSERT INTO projects (name) VALUES ('Proposal verification') RETURNING id")).rows[0].id;
    await client.query('INSERT INTO trello_connections (project_id,board_id,operational_list_ids) VALUES ($1,$2,$3)',[projectId,boardId,JSON.stringify([listId])]);
    await client.query('INSERT INTO tracking_policy_versions (project_id,version,due_soon_hours,stale_after_minutes,confirmed) VALUES ($1,1,72,60,false)',[projectId]);
    const passwordHash=await hashPassword(password);for(const role of ['manager','viewer']){const user=(await client.query<AuthUser>('INSERT INTO users (login,display_name,password_hash) VALUES ($1,$2,$3) RETURNING *',[loginName+'-'+role,role,passwordHash])).rows[0]!;await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)',[projectId,user.id,role]);if(role==='manager')actor=user;}
    options={database,trelloCredentials:{key:'k'.repeat(32),token:'t'.repeat(64)},githubToken:null,fetcher:sourceFetcher};await refresh();
    provider=new ChatGPTService({database,callbackOrigin:'http://127.0.0.1:3100',fetcher});binding={projectId,userId:actor.id,authVersion:actor.auth_version,sessionId:'synthetic-session'};connect();
    service=new ProposalService(database,provider);await service.initialize();
    app=buildApp({checkDatabase:async()=>{},auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,chatgpt:provider,proposals:service}});headers=await login('manager');viewerHeaders=await login('viewer');
  });
  afterAll(async()=>{if(provider)await provider.close();if(service)await service.close();if(app)await app.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  const path=()=>`/api/v1/projects/${projectId}/proposals`;
  function connect(){provider.connections.begin(binding,'http://127.0.0.1/callback','oaiapp_test','synthetic');const consumed=provider.connections.consume(binding);provider.connections.complete(binding,consumed.entry,'SYNTHETIC_ACCESS',3600,[{slug:'gpt-6.1-sol',displayName:'Synthetic model',reasoningEfforts:['low','medium','high','xhigh','max']}]);}
  async function refresh(){const queued=await enqueueJob(database,projectId,actor,'trello_sync',randomUUID());await executeJob(options,(await claimJob(database,projectId))!);const analysis=await enqueueJob(database,projectId,actor,'analysis',randomUUID());await executeJob(options,(await claimJob(database,projectId))!);runId=(await getJob(client,projectId,analysis.id))!.job.runId!;expect(queued.id).toBeTruthy();}
  const cookie=(response:{headers:Record<string,unknown>})=>{const values=response.headers['set-cookie'];return (Array.isArray(values)?values:[values]).reverse().find(value=>typeof value==='string'&&value.startsWith('dpa_session='))?.split(';')[0] as string;};
  async function login(role:string){const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});const response=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:loginName+'-'+role,password}});expect(response.statusCode).toBe(200);return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};}
  const request=()=>({sourceRunId:runId,cardId:board.cards[0]!.id,requestedDue:new Date(Date.now()+7*86400_000).toISOString(),goal:'Revisar el vencimiento con el gestor.',model:'gpt-6.1-sol',reasoningEffort:'high' as const,requestKey:randomUUID()});
  async function prepare(extra={}){const job=await service.prepare(binding,actor,{...request(),...extra});await service.waitForIdle();return {job,detail:(await service.version(projectId,job.proposalId,job.version))!};}
  it('enforces session, membership, manager, CSRF and origin protections',async()=>{
    expect((await app.inject({method:'GET',url:path()})).statusCode).toBe(401);expect((await app.inject({method:'GET',url:'/api/v1/projects/'+randomUUID()+'/proposals',headers})).statusCode).toBe(404);
    expect((await app.inject({method:'POST',url:path(),headers:viewerHeaders,payload:request()})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path(),headers:{origin,cookie:headers.cookie},payload:request()})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path(),headers:{...headers,origin:'https://evil.example'},payload:request()})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path(),headers,payload:{...request(),reasoningEffort:'ultra'}})).statusCode).toBe(400);
  });
  it('rejects a target before the source start without creating jobs or consuming provider usage',async()=>{
    const originalStart=board.cards[0]!.start;board.cards[0]!.start=new Date(Date.now()+10*86400_000).toISOString();await refresh();
    const count=(await service.overview(projectId)).jobs.length,before=calls.length;
    try{await expect(service.prepare(binding,actor,request())).rejects.toMatchObject({code:'TARGET_BEFORE_START'});expect(calls.length).toBe(before);expect((await service.overview(projectId)).jobs.length).toBe(count);}
    finally{board.cards[0]!.start=originalStart;await refresh();}
  });
  it('runs three sequential stages, seals content and deduplicates without repeating inference',async()=>{
    calls=[];const payload=request(),job=await service.prepare(binding,actor,payload);await service.waitForIdle();const detail=(await service.version(projectId,job.proposalId,1))!;
    expect(calls).toEqual(['executor','reviewer','approver']);expect(detail.state).toBe('pending_human_approval');expect(detail.contentHash).toMatch(/^[a-f0-9]{64}$/);expect(detail.messages).toHaveLength(3);expect(detail.decisions).toEqual([]);
    expect((await service.prepare(binding,actor,payload)).id).toBe(job.id);expect(calls).toHaveLength(3);await expect(service.prepare(binding,actor,{...payload,goal:'Another goal'})).rejects.toMatchObject({code:'CONFLICT'});
    expect((await app.inject({method:'GET',url:path()+`/${job.proposalId}/versions/1`,headers:viewerHeaders})).json().contentHash).toBe(detail.contentHash);
    await expect(service.decide(projectId,actor,job.proposalId,1,'0'.repeat(64),'approved','',randomUUID())).rejects.toMatchObject({code:'CONFLICT'});
    const key=randomUUID();const accepted=await service.decide(projectId,actor,job.proposalId,1,detail.contentHash!,'approved','Revisada.',key);expect(accepted.state).toBe('authorized');expect((await service.decide(projectId,actor,job.proposalId,1,detail.contentHash!,'approved','Revisada.',key)).decisionId).toBe(accepted.decisionId);expect(calls).toHaveLength(3);
    expect(JSON.stringify(await service.version(projectId,job.proposalId,1))).not.toMatch(/SYNTHETIC_ACCESS|PRIVATE_UPSTREAM/);
  });
  it('stops on requested changes and creates a fully reviewed new version without inheriting approval',async()=>{
    mode='adjust';calls=[];const first=await prepare();expect(first.detail.state).toBe('changes_requested');expect(calls).toEqual(['executor','reviewer']);const sealed=JSON.stringify(first.detail);mode='ok';calls=[];
    const second=await prepare({proposalId:first.job.proposalId,expectedVersion:1,goal:'Aclarar la nueva fecha objetivo.'});expect(second.job.version).toBe(2);expect(second.detail.state).toBe('pending_human_approval');expect(second.detail.decisions).toEqual([]);expect(calls).toEqual(['executor','reviewer','approver']);expect(JSON.stringify(await service.version(projectId,first.job.proposalId,1))).toBe(sealed);
    await expect(service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','',randomUUID())).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('records human adjustment and rejection reasons while preserving the exact approved candidate',async()=>{
    const first=await prepare(),base=path()+`/${first.job.proposalId}/versions/1/decisions`,payload={contentHash:first.detail.contentHash!,decision:'changes_requested',reason:'Ajustar el objetivo.',requestKey:randomUUID()};
    expect((await app.inject({method:'POST',url:base,headers:viewerHeaders,payload})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:base,headers,payload:{...payload,reason:''}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:base,headers,payload})).json().state).toBe('changes_requested');
    const second=await prepare({proposalId:first.job.proposalId,expectedVersion:1});const decision=await service.decide(projectId,actor,second.job.proposalId,2,second.detail.contentHash!,'rejected','Fuera de plazo.',randomUUID());expect(decision.state).toBe('rejected');
    await expect(service.prepare(binding,actor,{...request(),proposalId:second.job.proposalId,expectedVersion:2})).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('rejects automatic external approval and resumes only the pending stage after a quota error',async()=>{
    mode='unsafe';calls=[];const invalid=await prepare();expect(invalid.detail.state).toBe('pending_policy_check');expect(invalid.detail.messages.at(-1)?.errorCode).toBe('INVALID_AGENT_VERDICT');mode='ok';calls=[];
    await service.resume(binding,actor,invalid.job.proposalId,1,'gpt-6.1-sol','high',randomUUID());await service.waitForIdle();expect(calls).toEqual(['approver']);
    mode='quota';calls=[];const quota=await prepare();expect(quota.detail.state).toBe('pending_review');expect(quota.detail.messages.at(-1)?.errorCode).toBe('USAGE_LIMIT');expect(calls).toEqual(['executor','reviewer']);const hash=quota.detail.contentHash;mode='ok';calls=[];
    await service.resume(binding,actor,quota.job.proposalId,1,'gpt-6.1-sol','high',randomUUID());await service.waitForIdle();const resumed=(await service.version(projectId,quota.job.proposalId,1))!;expect(calls).toEqual(['reviewer','approver']);expect(resumed.contentHash).toBe(hash);expect(resumed.state).toBe('pending_human_approval');
  });
  it('invalidates a stale source before authorization and requires a new frozen context',async()=>{
    const first=await prepare();board.cards[0]!.due='2026-10-12T22:00:00.000Z';await refresh();const decision=await service.decide(projectId,actor,first.job.proposalId,1,first.detail.contentHash!,'approved','',randomUUID());expect(decision).toMatchObject({state:'invalidated',invalidated:true});expect((await service.version(projectId,first.job.proposalId,1))!.decisions).toEqual([]);
    const second=await prepare({proposalId:first.job.proposalId,expectedVersion:1});expect(second.detail.content?.actions[0]?.expectedDue).toBe(board.cards[0]!.due);expect(second.detail.contentHash).not.toBe(first.detail.contentHash);
    await client.query('INSERT INTO tracking_policy_versions (project_id,version,due_soon_hours,stale_after_minutes,confirmed) VALUES ($1,2,24,60,false)',[projectId]);expect((await service.recheck(projectId,actor,second.job.proposalId,2)).state).toBe('invalidated');await refresh();
  });
  it('does not publish a disconnected response and blocks concurrent work',async()=>{
    let release:()=>void=()=>{};const began=new Promise<void>(resolve=>{started=resolve;});pause=new Promise<void>(resolve=>{release=resolve;});calls=[];
    const job=await service.prepare(binding,actor,request());await began;await expect(service.prepare(binding,actor,request())).rejects.toMatchObject({code:'CONFLICT'});provider.connections.disconnect(binding);pause=null;release();await service.waitForIdle();expect((await service.version(projectId,job.proposalId,1))!.content).toBeNull();expect(calls).toEqual(['executor']);connect();
  });
  it('blocks a response after the manager loses authority and recovers without replay',async()=>{
    let release:()=>void=()=>{};const began=new Promise<void>(resolve=>{started=resolve;});pause=new Promise<void>(resolve=>{release=resolve;});calls=[];
    const job=await service.prepare(binding,actor,request());await began;await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);pause=null;release();await service.waitForIdle();expect((await service.overview(projectId)).jobs.find(value=>value.id===job.id)?.errorCode).toBe('FORBIDDEN');await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);
    await client.query("UPDATE agent_jobs SET status='running' WHERE id=$1",[job.id]);const before=calls.length;await service.initialize();expect(calls.length).toBe(before);expect((await service.overview(projectId)).jobs.find(value=>value.id===job.id)).toMatchObject({status:'interrupted',errorCode:'SERVICE_RESTARTED'});
  });
  it('runs the complete authorization workflow with the restricted runtime database role',async()=>{
    await client.query('SET LOCAL ROLE dev_project_agent_app');try{const proposal=await prepare();expect(proposal.detail.state).toBe('pending_human_approval');expect((await service.decide(projectId,actor,proposal.job.proposalId,1,proposal.detail.contentHash!,'approved','',randomUUID())).state).toBe('authorized');}finally{await client.query('RESET ROLE');}
  });
  it('restricts runtime updates to lifecycle fields and keeps evidence and decisions immutable',async()=>{
    const grants=await client.query("SELECT has_column_privilege('dev_project_agent_app','proposal_versions','state','UPDATE') AS state,has_column_privilege('dev_project_agent_app','proposal_versions','context','UPDATE') AS context,has_table_privilege('dev_project_agent_app','proposal_contents','UPDATE') AS content,has_table_privilege('dev_project_agent_app','agent_messages','DELETE') AS messages,has_table_privilege('dev_project_agent_app','proposal_decisions','UPDATE') AS decisions");expect(grants.rows[0]).toEqual({state:true,context:false,content:false,messages:false,decisions:false});
  });
});
