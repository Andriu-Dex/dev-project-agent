import type {RequestedTrelloChange} from '@dev-project-agent/contracts';
import {changeTrackingPolicy,readTrackingPolicy} from '../tracking/policy.js';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
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
import {ExecutionService} from './execution.js';
import {trelloExecutionRemote} from '../../integrations/trello/execution-client.js';
import {syntheticContent,syntheticVerdict} from './fixtures.js';

describe.skipIf(process.env.RUN_EXECUTIONS_DB_TESTS!=='true')('PostgreSQL controlled Trello execution',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,app:ReturnType<typeof buildApp>,provider:ChatGPTService,service:ProposalService,executor:ExecutionService,projectId:string,actor:AuthUser,binding:ConnectionBinding,runId:string,options:SupervisionOptions;
  let headers:Record<string,string>,viewerHeaders:Record<string,string>,calls:string[]=[],mode='ok',pause:Promise<void>|null=null,started:()=>void=()=>{};
  const board=boardFixture(),origin='http://127.0.0.1:5174',loginName='proposal-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
  let writeMode='ok',writeCalls=0,remoteCalls=0,denyRemote=false,afterRead=false,permissionHook:()=>Promise<void>=async()=>{};
  const labelInventory=['PENDIENTE','EN CURSO','COMPLETADA','ALTA','BAJA'].map((name,index)=>({name,id:String(index+1).repeat(24)}));
  const executionFetcher:typeof fetch=async(input,request)=>{remoteCalls++;const url=new URL(String(input));expect(url.hostname).toBe('api.trello.com');expect(url.href).not.toContain('oauth_token');if(request?.method==='PUT'){writeCalls++;expect(url.pathname).toBe('/1/cards/'+board.cards[0]!.id);const payload=JSON.parse(String(request.body));afterRead=true;if(writeMode==='reject')return new Response(null,{status:403});if(writeMode!=='lost'){if(payload.due)board.cards[0]!.due=payload.due;if(payload.start)board.cards[0]!.start=payload.start;if(payload.idMembers!==undefined)board.cards[0]!.idMembers=payload.idMembers.split(',');if(payload.idLabels!==undefined)board.cards[0]!.labels=payload.idLabels.split(',').map((id:string)=>({name:labelInventory.find(label=>label.id===id)!.name}));if(payload.dueComplete!==undefined)board.cards[0]!.dueComplete=payload.dueComplete;}if(writeMode==='otherchange')board.cards[0]!.dueComplete=true;if(writeMode==='timeout'||writeMode==='lost')throw new Error('PRIVATE_NETWORK_DETAIL');return Response.json({id:board.cards[0]!.id,due:board.cards[0]!.due});}if(url.pathname.endsWith('/labels'))return Response.json(labelInventory);if(url.pathname==='/1/members/me'){await permissionHook();return Response.json({id:board.members[0]!.id});}if(url.pathname.endsWith('/memberships'))return Response.json([{idMember:board.members[0]!.id,memberType:denyRemote?'observer':'normal'}]);if(url.searchParams.get('fields')==='id,closed')return Response.json({id:boardId,closed:false});if(afterRead&&writeMode==='readfail')throw new Error('PRIVATE_NETWORK_DETAIL');return sourceFetcher(input,request);};
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
    service=new ProposalService(database,provider);await service.initialize();executor=new ExecutionService(database,{enabled:true,remote:trelloExecutionRemote(options.trelloCredentials!,executionFetcher)});await executor.initialize();
    app=buildApp({checkDatabase:async()=>{},auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,chatgpt:provider,proposals:service,executions:executor}});headers=await login('manager');viewerHeaders=await login('viewer');
  });
  afterAll(async()=>{if(executor)await executor.close();if(provider)await provider.close();if(service)await service.close();if(app)await app.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  const path=()=>`/api/v1/projects/${projectId}/proposals`;
  function connect(){provider.connections.begin(binding,'http://127.0.0.1/callback','oaiapp_test','synthetic');const consumed=provider.connections.consume(binding);provider.connections.complete(binding,consumed.entry,'SYNTHETIC_ACCESS',3600,[{slug:'gpt-6.1-sol',displayName:'Synthetic model',reasoningEfforts:['low','medium','high','xhigh','max']}]);}
  async function refresh(){const queued=await enqueueJob(database,projectId,actor,'trello_sync',randomUUID());await executeJob(options,(await claimJob(database,projectId))!);const analysis=await enqueueJob(database,projectId,actor,'analysis',randomUUID());await executeJob(options,(await claimJob(database,projectId))!);runId=(await getJob(client,projectId,analysis.id))!.job.runId!;expect(queued.id).toBeTruthy();}
  const cookie=(response:{headers:Record<string,unknown>})=>{const values=response.headers['set-cookie'];return (Array.isArray(values)?values:[values]).reverse().find(value=>typeof value==='string'&&value.startsWith('dpa_session='))?.split(';')[0] as string;};
  async function login(role:string){const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});const response=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:loginName+'-'+role,password}});expect(response.statusCode).toBe(200);return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};}
  const request=()=>({sourceRunId:runId,cardId:board.cards[0]!.id,requestedDue:new Date(Date.now()+7*86400_000).toISOString(),goal:'Revisar el vencimiento con el gestor.',model:'gpt-6.1-sol',reasoningEffort:'high' as const,requestKey:randomUUID(),purpose:'live' as const});
  async function prepare(extra={}){const job=await service.prepare(binding,actor,{...request(),...extra});await service.waitForIdle();return {job,detail:(await service.version(projectId,job.proposalId,job.version))!};}

  beforeEach(async()=>{await executor.waitForIdle();Object.assign(board,boardFixture());writeMode='ok';writeCalls=0;remoteCalls=0;denyRemote=false;afterRead=false;permissionHook=async()=>{};await refresh();});
  async function approved(extra={}){const result=await prepare(extra);expect(result.detail.state).toBe('pending_human_approval');await service.decide(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,'approved','Reviewed synthetic proposal.',randomUUID());return result;}
  async function execute(result:Awaited<ReturnType<typeof approved>>,key=randomUUID()){const job=await executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,key,true);await executor.waitForIdle();return (await executor.detail(projectId,job.id))!;}
  it.each(['dates','priority','members','state'] as const)('reviews, approves and verifies a %s change with one synthetic PUT',async family=>{
    board.members.push({id:'e'.repeat(24),fullName:'Second test member',username:'second-test'});
    const current=(await readTrackingPolicy(client,projectId))!;await changeTrackingPolicy(database,projectId,actor,{expectedVersion:current.version,dueSoonHours:72,staleAfterMinutes:60,priorityLabels:{ALTA:'high',BAJA:'low'}});await refresh();
    const requestedChange:RequestedTrelloChange=family==='dates'?{family,start:new Date(Date.now()+86_400_000).toISOString(),due:new Date(Date.now()+3*86_400_000).toISOString()}:family==='members'?{family,memberIds:['e'.repeat(24)]}:{family,label:family==='priority'?'ALTA':'EN CURSO'};
    const result=await approved({requestedDue:undefined,requestedChange});expect(result.detail.requestedDue).toBeNull();
    const execution=await execute(result);expect(execution.job.status).toBe('succeeded');expect(writeCalls).toBe(1);
    expect((await service.version(projectId,result.job.proposalId,1))!.state).toBe('executed');
  });
  it('withdraws atomically while preflight is reading and prevents the durable write boundary',async()=>{
    const approvedProposal=await approved();let entered:()=>void=()=>{},release:()=>void=()=>{};
    const reached=new Promise<void>(resolve=>{entered=resolve;}),waiting=new Promise<void>(resolve=>{release=resolve;});permissionHook=async()=>{entered();await waiting;};
    const job=await executor.request(projectId,actor,approvedProposal.job.proposalId,1,approvedProposal.detail.contentHash!,randomUUID(),true);await reached;
    await executor.withdraw(projectId,actor,approvedProposal.job.proposalId,1,'Retirar antes de iniciar efectos externos.');release();await executor.waitForIdle();
    expect(writeCalls).toBe(0);expect((await executor.detail(projectId,job.id))!.job).toMatchObject({status:'blocked',errorCode:'AUTHORIZATION_WITHDRAWN'});
  });
  it('creates a separately reviewed and approved reversal of a verified member change',async()=>{
    board.members.push({id:'e'.repeat(24),fullName:'Second member',username:'second'});await refresh();
    const originalMembers=[...board.cards[0]!.idMembers];
    const first=await approved({requestedDue:undefined,requestedChange:{family:'members',memberIds:['e'.repeat(24)]}});const applied=await execute(first);await refresh();
    const reverse=await prepare({requestedDue:undefined,reversalOf:applied.job.id,goal:'Restaurar la asignación anterior; revisar sus riesgos.'});
    expect(reverse.detail.state).toBe('pending_human_approval');expect(reverse.detail.content!.actions[0]).toMatchObject({type:'trello_members_change',proposedMembers:originalMembers});
    await expect(executor.request(projectId,actor,reverse.job.proposalId,1,reverse.detail.contentHash!,randomUUID(),true)).rejects.toHaveProperty('code','CONFLICT');
    await service.decide(projectId,actor,reverse.job.proposalId,1,reverse.detail.contentHash!,'approved','Reviewed reversal with a separate authorization.',randomUUID());
    const result=await execute(reverse);expect(result.job.status).toBe('succeeded');expect(board.cards[0]!.idMembers).toEqual(originalMembers);expect(writeCalls).toBe(2);
  });
  it('blocks demonstration proposals permanently, including later versions, with zero remote requests',async()=>{
    const result=await approved({purpose:'demonstration'});await expect(executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'DEMONSTRATION_ONLY'});expect(remoteCalls).toBe(0);
    await executor.withdraw(projectId,actor,result.job.proposalId,1,'Demonstration only.');expect((await service.version(projectId,result.job.proposalId,1))!.state).toBe('invalidated');
    await expect(prepare({proposalId:result.job.proposalId,expectedVersion:1,purpose:'live'})).rejects.toMatchObject({code:'CONFLICT'});expect(remoteCalls).toBe(0);
    const next=await prepare({proposalId:result.job.proposalId,expectedVersion:1,purpose:'demonstration'});expect(next.detail.purpose).toBe('demonstration');
  });
  it('rejects disabled writes, missing confirmation, missing approval and a different hash without remote calls',async()=>{
    const candidate=await prepare();await expect(executor.request(projectId,actor,candidate.job.proposalId,1,candidate.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'CONFLICT'});
    const result=await approved();const disabled=new ExecutionService(database,{enabled:false,remote:trelloExecutionRemote(options.trelloCredentials!,executionFetcher)});
    await expect(disabled.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'WRITES_DISABLED'});
    await expect(executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),false)).rejects.toMatchObject({code:'CONFIRMATION_REQUIRED'});
    await expect(executor.request(projectId,actor,result.job.proposalId,1,'0'.repeat(64),randomUUID(),true)).rejects.toMatchObject({code:'HASH_MISMATCH'});expect(remoteCalls).toBe(0);
  });
  it('enforces sessions, role, CSRF, origin and project scope on execution routes',async()=>{
    const result=await approved(),url=path()+`/${result.job.proposalId}/versions/1/execute`,payload={contentHash:result.detail.contentHash!,confirmed:true,requestKey:randomUUID()};
    expect((await app.inject({method:'GET',url:`/api/v1/projects/${projectId}/executions`})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url,headers:viewerHeaders,payload})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url,headers:{origin,cookie:headers.cookie},payload})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url,headers:{...headers,origin:'https://evil.example'},payload})).statusCode).toBe(403);
    expect((await app.inject({method:'GET',url:'/api/v1/projects/'+randomUUID()+'/executions',headers})).statusCode).toBe(404);expect(writeCalls).toBe(0);
  });
  it('writes once, verifies the fresh result and deduplicates the exact request',async()=>{
    const result=await approved(),key=randomUUID(),done=await execute(result,key);expect(done.job.status).toBe('succeeded');expect(writeCalls).toBe(1);expect(done.events.map(event=>event.stage)).toEqual(['request','preflight','write','verification']);expect(done.events.at(-1)?.evidence?.due).toBe(result.detail.requestedDue);expect((await service.version(projectId,result.job.proposalId,1))!.state).toBe('executed');
    expect((await executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,key,true)).id).toBe(done.job.id);expect(writeCalls).toBe(1);
    await expect(executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'CONFLICT'});
    expect((await app.inject({method:'GET',url:`/api/v1/projects/${projectId}/executions/${done.job.id}`,headers:viewerHeaders})).json().job.status).toBe('succeeded');
    expect(JSON.stringify(done)).not.toMatch(/PRIVATE_NETWORK_DETAIL|oauth_token|SYNTHETIC_ACCESS/);
  });
  it('invalidates a changed live card before the PUT even if the cached snapshot is unchanged',async()=>{
    const result=await approved();board.cards[0]!.due=new Date(Date.now()+2*86400_000).toISOString();const done=await execute(result);expect(done.job).toMatchObject({status:'blocked',errorCode:'SOURCE_CHANGED'});expect(writeCalls).toBe(0);
  });
  it('blocks a revoked approval identity and policy changes without any remote writes',async()=>{
    const result=await approved();await client.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[actor.id]);await expect(executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'FORBIDDEN'});await client.query('UPDATE users SET auth_version=auth_version-1 WHERE id=$1',[actor.id]);
    const version=(await client.query('SELECT max(version) AS version FROM tracking_policy_versions WHERE project_id=$1',[projectId])).rows[0].version;await client.query('INSERT INTO tracking_policy_versions (project_id,version,due_soon_hours,stale_after_minutes,confirmed) VALUES ($1,$2,72,60,false)',[projectId,version+1]);
    await expect(executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(writeCalls).toBe(0);
  });
  it('rechecks local manager authority after the remote reads and stops before writing',async()=>{
    const result=await approved();permissionHook=async()=>{await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);};const done=await execute(result);expect(done.job.errorCode).toBe('FORBIDDEN');expect(writeCalls).toBe(0);await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);
  });
  it('blocks an observer and permits an explicit retry only after a proven rejection',async()=>{
    const result=await approved();denyRemote=true;expect((await execute(result)).job.errorCode).toBe('REMOTE_ACCESS_DENIED');expect(writeCalls).toBe(0);denyRemote=false;writeMode='reject';expect((await execute(result)).job).toMatchObject({status:'failed',errorCode:'REMOTE_WRITE_REJECTED'});expect(writeCalls).toBe(1);writeMode='ok';expect((await execute(result)).job.status).toBe('succeeded');expect(writeCalls).toBe(2);
  });
  it('verifies an applied write after a lost response without repeating it',async()=>{
    const result=await approved();writeMode='timeout';expect((await execute(result)).job.status).toBe('succeeded');expect(writeCalls).toBe(1);
  });
  it('keeps a lost write pending when the old value is visible, then reconciles by GET only',async()=>{
    const result=await approved();writeMode='lost';const uncertain=await execute(result);expect(uncertain.job.status).toBe('reconciliation_required');expect(writeCalls).toBe(1);
    await expect(executor.request(projectId,actor,result.job.proposalId,1,result.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'CONFLICT'});
    expect((await executor.reconcile(projectId,actor,uncertain.job.id))!.job.status).toBe('reconciliation_required');expect(writeCalls).toBe(1);
    board.cards[0]!.due=result.detail.requestedDue;expect((await executor.reconcile(projectId,actor,uncertain.job.id))!.job.status).toBe('succeeded');expect(writeCalls).toBe(1);
  });
  it('blocks all later executions while an uncertain write needs reconciliation',async()=>{
    const result=await approved();writeMode='lost';const uncertain=await execute(result);const another=await approved();
    await expect(executor.request(projectId,actor,another.job.proposalId,1,another.detail.contentHash!,randomUUID(),true)).rejects.toMatchObject({code:'CONFLICT'});expect(writeCalls).toBe(1);
    board.cards[0]!.due=result.detail.requestedDue;await executor.reconcile(projectId,actor,uncertain.job.id);
  });
  it('does not claim success when another relevant field changed during the write',async()=>{
    const result=await approved();writeMode='otherchange';const uncertain=await execute(result);expect(uncertain.job.status).toBe('reconciliation_required');expect(writeCalls).toBe(1);
    board.cards[0]!.dueComplete=false;await executor.reconcile(projectId,actor,uncertain.job.id);expect(writeCalls).toBe(1);
  });
  it('checks the destination list even when the displayed state stays the same',async()=>{
    const result=await approved();const secondId='e'.repeat(24);board.lists.push({id:secondId,name:'Other phase',closed:false});board.cards[0]!.idList=secondId;
    expect((await execute(result)).job.errorCode).toBe('SOURCE_CHANGED');expect(writeCalls).toBe(0);
  });
  it('requires reconciliation when verification cannot be read',async()=>{
    const result=await approved();writeMode='readfail';const uncertain=await execute(result);expect(uncertain.job).toMatchObject({status:'reconciliation_required',errorCode:'REMOTE_READ_FAILED'});writeMode='ok';expect((await executor.reconcile(projectId,actor,uncertain.job.id))!.job.status).toBe('succeeded');expect(writeCalls).toBe(1);
  });
  it('recovers interrupted jobs at the durable write boundary without network calls or replay',async()=>{
    const result=await approved();writeMode='reject';const job=(await execute(result)).job;const before=remoteCalls;
    await client.query("UPDATE execution_jobs SET status='running',write_started_at=NULL WHERE id=$1",[job.id]);await client.query("UPDATE proposal_versions SET state='executing' WHERE proposal_id=$1",[result.job.proposalId]);await executor.initialize();expect((await executor.detail(projectId,job.id))!.job.status).toBe('failed');expect(remoteCalls).toBe(before);
    await client.query("UPDATE execution_jobs SET status='running',write_started_at=clock_timestamp() WHERE id=$1",[job.id]);await client.query("UPDATE proposal_versions SET state='executing' WHERE proposal_id=$1",[result.job.proposalId]);await executor.initialize();expect((await executor.detail(projectId,job.id))!.job.status).toBe('reconciliation_required');expect(remoteCalls).toBe(before);
    writeMode='ok';board.cards[0]!.due=result.detail.requestedDue;await executor.reconcile(projectId,actor,job.id);expect(writeCalls).toBe(1);
  });
  it('allows withdrawal or a fully reviewed new version after a proven failure, preserving failed attempts',async()=>{
    const first=await approved();writeMode='reject';const failed=await execute(first);await executor.withdraw(projectId,actor,first.job.proposalId,1,'Do not retry this change.');expect((await service.version(projectId,first.job.proposalId,1))!.state).toBe('invalidated');expect((await executor.detail(projectId,failed.job.id))!.job.status).toBe('failed');
    const second=await approved();await execute(second);board.cards[0]!.due=new Date(Date.now()+3*86400_000).toISOString();await refresh();expect((await service.recheck(projectId,actor,second.job.proposalId,1)).state).toBe('invalidated');
    const next=await prepare({proposalId:second.job.proposalId,expectedVersion:1});expect(next.detail.state).toBe('pending_human_approval');expect(next.detail.decisions).toEqual([]);
  });
  it('runs with the restricted role and keeps purpose, approved content and events immutable',async()=>{
    await client.query('SET LOCAL ROLE dev_project_agent_app');try{const demo=await approved({purpose:'demonstration'});await executor.withdraw(projectId,actor,demo.job.proposalId,1,'Withdraw demonstration.');const result=await approved(),done=await execute(result);expect(done.job.status).toBe('succeeded');}finally{await client.query('RESET ROLE');}
    const grants=(await client.query("SELECT has_column_privilege('dev_project_agent_app','proposals','purpose','UPDATE') AS purpose,has_column_privilege('dev_project_agent_app','execution_jobs','status','UPDATE') AS status,has_column_privilege('dev_project_agent_app','execution_jobs','content_hash','UPDATE') AS hash,has_table_privilege('dev_project_agent_app','execution_events','UPDATE') AS events,has_table_privilege('dev_project_agent_app','execution_events','DELETE') AS deletion")).rows[0];expect(grants).toEqual({purpose:false,status:true,hash:false,events:false,deletion:false});
  });
});
