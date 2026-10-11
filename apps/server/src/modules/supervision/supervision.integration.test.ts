import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildApp} from '../../app.js';
import {hashPassword} from '../auth/password.js';
import type {AuthUser} from '../auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {boardFixture,boardId,listId} from '../../integrations/trello/fixtures.js';
import {githubOverview} from '../../integrations/github/service.js';
import {confirmBaseline,latestBaseline} from './baseline.js';
import {claimJob,enqueueJob,expireExhaustedJobs,finishJob,getJob,getRun,heartbeat} from './jobs.js';
import {executeJob,type SupervisionOptions} from './worker.js';

describe.skipIf(process.env.RUN_SUPERVISION_DB_TESTS!=='true')('PostgreSQL supervision workflow',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,app:ReturnType<typeof buildApp>,projectId:string,manager:AuthUser,viewer:AuthUser,options:SupervisionOptions;
  let firstRunId:string,firstResult:string;let head='a'.repeat(40),githubFailure=false;
  const origin='http://127.0.0.1:5174',loginName='supervision-test-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
  const board=boardFixture();const rawBoard={...board,cards:board.cards.map(card=>({...card,desc:'CÓDIGO WBS: 1.1\nPREDECESORAS WBS: Ninguna',idChecklists:[]})),checklists:[]};
  const fetcher:typeof fetch=async input=>{
    const url=new URL(String(input));
    if(url.hostname==='api.trello.com'){
      const value=url.pathname.endsWith('/lists')?rawBoard.lists:url.pathname.endsWith('/members')?rawBoard.members:url.pathname.endsWith('/cards')?rawBoard.cards:url.pathname.endsWith('/checklists')?[]:rawBoard;
      return Response.json(value);
    }
    if(githubFailure)return new Response('UPSTREAM_SECRET',{status:429,headers:{'x-ratelimit-remaining':'0'}});
    const value=url.pathname.endsWith('/branches')?[{name:'develop',commit:{sha:head}}]:url.pathname.endsWith('/commits')?[{sha:head,commit:{message:'Synthetic change',author:{name:'Test member'},committer:{date:'2026-10-11T10:00:00Z'}}}]:url.pathname.includes('/compare/')?{status:'ahead',files:[]}:url.pathname.includes('/commits/')?{files:[]}:{full_name:'example/project',default_branch:'main'};
    return Response.json(value);
  };
  const cookie=(response:{headers:Record<string,unknown>})=>{const values=response.headers['set-cookie'];return (Array.isArray(values)?values:[values]).reverse().find(value=>typeof value==='string'&&value.startsWith('dpa_session='))?.split(';')[0] as string;};
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    database={query:client.query.bind(client),connect:async()=>({query:async(sql:string,parameters?:unknown[])=>{
      if(sql.startsWith('BEGIN'))return client.query('SAVEPOINT supervision_test');
      if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT supervision_test');
      if(sql==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT supervision_test');return client.query('RELEASE SAVEPOINT supervision_test');}
      return client.query(sql,parameters);
    },release:()=>{}})} as unknown as TrelloDatabase;
    projectId=(await client.query<{id:string}>("INSERT INTO projects (name) VALUES ('Supervision verification') RETURNING id")).rows[0]!.id;
    await client.query('INSERT INTO trello_connections (project_id,board_id,operational_list_ids) VALUES ($1,$2,$3)',[projectId,boardId,JSON.stringify([listId])]);
    await client.query("INSERT INTO github_connections (project_id,owner,repository,branch) VALUES ($1,'example','project','develop')",[projectId]);
    await client.query('INSERT INTO tracking_policy_versions (project_id,version,due_soon_hours,stale_after_minutes,confirmed) VALUES ($1,1,72,60,false)',[projectId]);
    const passwordHash=await hashPassword(password);
    for(const role of ['manager','viewer']){
      const actor=(await client.query<AuthUser>('INSERT INTO users (login,display_name,password_hash) VALUES ($1,$2,$3) RETURNING *',[loginName+'-'+role,role,passwordHash])).rows[0]!;
      await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)',[projectId,actor.id,role]);
      if(role==='manager')manager=actor;else viewer=actor;
    }
    options={database,trelloCredentials:{key:'k'.repeat(32),token:'t'.repeat(64)},githubToken:null,fetcher};
    app=buildApp({checkDatabase:async()=>{},auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,
      trello:{database,credentials:options.trelloCredentials,fetcher},supervision:options}});
  });
  afterAll(async()=>{if(app)await app.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  async function login(role:string){
    const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});
    const response=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:loginName+'-'+role,password}});
    expect(response.statusCode).toBe(200);return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};
  }
  async function run(kind:'full'|'analysis'){
    const queued=await enqueueJob(database,projectId,manager,kind,randomUUID());const claimed=await claimJob(database,projectId);expect(claimed!.id).toBe(queued.id);
    await executeJob(options,claimed!);return (await getJob(client,projectId,queued.id))!;
  }
  it('protects reads, mutations, CSRF and cross-project access',async()=>{
    const prefix=`/api/v1/projects/${projectId}`;
    for(const path of ['/github','/baseline','/supervision'])expect((await app.inject({method:'GET',url:prefix+path})).statusCode).toBe(401);
    const headers=await login('viewer');
    for(const path of ['/github','/baseline','/supervision'])expect((await app.inject({method:'GET',url:prefix+path,headers})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/v1/projects/00000000-0000-0000-0000-000000000000/supervision',headers})).statusCode).toBe(404);
    const payload={kind:'full',requestKey:randomUUID()};
    expect((await app.inject({method:'POST',url:prefix+'/supervision/jobs',headers,payload})).statusCode).toBe(403);
    const managerHeaders=await login('manager');
    expect((await app.inject({method:'POST',url:prefix+'/supervision/jobs',headers:{cookie:managerHeaders.cookie,origin},payload})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:prefix+'/supervision/jobs',headers:managerHeaders,payload:{kind:'shell',requestKey:randomUUID()}})).statusCode).toBe(400);
  });
  it('deduplicates requests and persists a full frozen analysis with stage evidence',async()=>{
    const headers=await login('manager'),path=`/api/v1/projects/${projectId}/supervision/jobs`,payload={kind:'full',requestKey:randomUUID()};
    const response=await app.inject({method:'POST',url:path,headers,payload});expect(response.statusCode).toBe(202);
    const duplicate=await app.inject({method:'POST',url:path,headers,payload});expect(duplicate.statusCode).toBe(202);expect(duplicate.json().id).toBe(response.json().id);
    expect((await app.inject({method:'POST',url:path,headers,payload:{...payload,requestKey:randomUUID()}})).statusCode).toBe(409);
    const claimed=await claimJob(database,projectId);expect(claimed!.id).toBe(response.json().id);expect(await claimJob(database,projectId)).toBeNull();
    await executeJob(options,claimed!);
    const detail=(await getJob(client,projectId,claimed!.id))!;expect(detail.job.status).toBe('succeeded');expect(detail.events.filter(event=>event.outcome==='succeeded').map(event=>event.stage)).toEqual(['trello','github','analysis']);
    const result=(await getRun(client,projectId,detail.job.runId!))!;firstRunId=result.id;firstResult=JSON.stringify(result.result);
    expect(result.result).toMatchObject({baselineVersion:null,dependencies:[],tracking:{policy:{version:'tracking-v1/config-v1'}},code:{head}});
    const viewerHeaders=await login('viewer');
    expect((await app.inject({method:'GET',url:path+'/'+claimed!.id,headers:viewerHeaders})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:`/api/v1/projects/00000000-0000-0000-0000-000000000000/supervision/runs/${result.id}`,headers:viewerHeaders})).statusCode).toBe(404);
  });
  it('requires explicit manager confirmation and rejects stale baseline versions or source cuts',async()=>{
    const path=`/api/v1/projects/${projectId}/baseline-versions`;
    const result=(await getRun(client,projectId,firstRunId))!;const payload={expectedVersion:0,snapshotId:result.result.trelloSnapshotId};
    expect((await app.inject({method:'POST',url:path,headers:await login('viewer'),payload})).statusCode).toBe(403);
    const headers=await login('manager');
    const response=await app.inject({method:'POST',url:path,headers,payload});expect(response.statusCode).toBe(201);expect(response.json().version).toBe(1);
    expect((await app.inject({method:'POST',url:path,headers,payload})).statusCode).toBe(409);
    const stale=await app.inject({method:'POST',url:path,headers,payload:{expectedVersion:1,snapshotId:randomUUID()}});expect(stale.statusCode).toBe(409);expect(stale.json().code).toBe('SOURCE_CHANGED');
  });
  it('compares new sources to the confirmed baseline while preserving prior analyses',async()=>{
    rawBoard.cards[0]!.due='2026-10-11T22:00:00.000Z';head='b'.repeat(40);
    const job=await run('full');expect(job.job.status).toBe('succeeded');
    const result=(await getRun(client,projectId,job.job.runId!))!;
    expect(result.result.baselineVersion).toBe(1);expect(result.result.deviations).toContainEqual(expect.objectContaining({field:'due',hoursShift:24}));
    expect(result.result.code).toMatchObject({head,base:'a'.repeat(40),comparison:'ahead'});
    expect(JSON.stringify((await getRun(client,projectId,firstRunId))!.result)).toBe(firstResult);
  });
  it('retains prior GitHub data after failure and marks the full analysis partial',async()=>{
    const previous=await githubOverview(client,projectId);githubFailure=true;
    try{
      const job=await run('full');expect(job.job).toMatchObject({status:'partial',errorCode:'RATE_LIMITED'});
      const current=await githubOverview(client,projectId);expect(current.latest!.id).toBe(previous.latest!.id);expect(current.lastAttempt!.status).toBe('failed');
      const result=(await getRun(client,projectId,job.job.runId!))!;expect(result.status).toBe('partial');expect(result.result.githubSnapshotId).toBe(previous.latest!.id);
      expect(JSON.stringify(job)).not.toContain('UPSTREAM_SECRET');expect(JSON.stringify(result)).not.toContain('UPSTREAM_SECRET');
    }finally{githubFailure=false;}
  });
  it('recovers an expired lease and prevents the old worker from publishing results',async()=>{
    const queued=await enqueueJob(database,projectId,manager,'analysis',randomUUID());const old=(await claimJob(database,projectId))!;
    await client.query("UPDATE supervision_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[queued.id]);
    const recovered=(await claimJob(database,projectId))!;expect(recovered.attempt).toBe(2);expect(recovered.lease_token).not.toBe(old.lease_token);
    await expect(heartbeat(database,old)).rejects.toMatchObject({code:'LEASE_LOST'});
    await expect(finishJob(database,old,'succeeded',null)).rejects.toMatchObject({code:'LEASE_LOST'});
    await executeJob(options,recovered);const detail=(await getJob(client,projectId,queued.id))!;expect(detail.job.status).toBe('succeeded');expect(detail.events).toContainEqual(expect.objectContaining({outcome:'recovered'}));
    await expect(finishJob(database,recovered,'succeeded',null)).rejects.toMatchObject({code:'LEASE_LOST'});
  });
  it('rechecks revoked manager permissions before processing queued work',async()=>{
    const queued=await enqueueJob(database,projectId,manager,'full',randomUUID());const claimed=(await claimJob(database,projectId))!;
    const count=(await client.query('SELECT count(*) FROM trello_snapshots WHERE project_id=$1',[projectId])).rows[0]!.count;
    await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,manager.id]);
    try{await executeJob(options,claimed);expect((await getJob(client,projectId,queued.id))!.job).toMatchObject({status:'failed',errorCode:'FORBIDDEN'});
      expect((await client.query('SELECT count(*) FROM trello_snapshots WHERE project_id=$1',[projectId])).rows[0]!.count).toBe(count);}
    finally{await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2',[projectId,manager.id]);}
  });
  it('rolls back baseline and result publication if auditing fails',async()=>{
    const failing={...database,connect:async()=>{const transaction=await database.connect();return {query:async(sql:string,parameters?:unknown[])=>{
      if(sql.startsWith('INSERT INTO audit_events'))throw new Error('Simulated audit failure.');return transaction.query(sql,parameters);
    },release:()=>transaction.release()};}} as unknown as TrelloDatabase;
    const current=(await client.query<{id:string}>('SELECT id FROM trello_snapshots WHERE project_id=$1 ORDER BY imported_at DESC,id DESC LIMIT 1',[projectId])).rows[0]!;
    await expect(confirmBaseline(failing,projectId,manager,1,current.id)).rejects.toThrow('Simulated audit failure.');expect((await latestBaseline(client,projectId))!.version).toBe(1);
    const queued=await enqueueJob(database,projectId,manager,'analysis',randomUUID()),claimed=(await claimJob(database,projectId))!;
    const result=(await getRun(client,projectId))!.result;
    await expect(finishJob(failing,claimed,'succeeded',null,result,1)).rejects.toThrow('Simulated audit failure.');
    expect((await getJob(client,projectId,queued.id))!.job).toMatchObject({status:'running',runId:null});
    await finishJob(database,claimed,'failed','STORAGE_UNAVAILABLE');
  });
  it('records exhaustion of bounded recovery attempts',async()=>{
    const queued=await enqueueJob(database,projectId,manager,'analysis',randomUUID());await claimJob(database,projectId);
    await client.query("UPDATE supervision_jobs SET attempt=3,lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[queued.id]);
    await expireExhaustedJobs(database,projectId);expect((await getJob(client,projectId,queued.id))!.job).toMatchObject({status:'failed',errorCode:'RECOVERY_EXHAUSTED'});
    expect(await claimJob(database,projectId)).toBeNull();
  });
  it('grants immutable history permissions and enforces project-scoped snapshot references',async()=>{
    const runtime=new pg.Pool({connectionString:process.env.APP_DATABASE_URL,max:1});
    try{for(const table of ['github_snapshots','baseline_versions','supervision_runs','supervision_job_events']){
      const row=(await runtime.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS read,has_table_privilege(current_user,$1,'INSERT') AS append,has_table_privilege(current_user,$1,'UPDATE') AS update,has_table_privilege(current_user,$1,'DELETE') AS delete",[table])).rows[0];
      expect(row).toEqual({read:true,append:true,update:false,delete:false});
    }}finally{await runtime.end();}
    const other=(await client.query<{id:string}>("INSERT INTO projects (name) VALUES ('Other verification') RETURNING id")).rows[0]!;
    await client.query('INSERT INTO trello_connections (project_id,board_id,operational_list_ids) VALUES ($1,$2,$3)',[other.id,boardId,'[]']);
    const foreign=(await client.query<{id:string}>("INSERT INTO trello_snapshots (project_id,source,observed_at,data,changes) VALUES ($1,'export',clock_timestamp(),'{}','[]') RETURNING id",[other.id])).rows[0]!;
    await client.query('SAVEPOINT foreign_reference');
    try{await expect(client.query('INSERT INTO baseline_versions (project_id,version,snapshot_id,confirmed_by) VALUES ($1,99,$2,$3)',[projectId,foreign.id,manager.id])).rejects.toMatchObject({code:'23503'});}
    finally{await client.query('ROLLBACK TO SAVEPOINT foreign_reference');await client.query('RELEASE SAVEPOINT foreign_reference');}
    expect(viewer.id).not.toBe(manager.id);
  });
});
