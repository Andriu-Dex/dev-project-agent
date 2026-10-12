import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import type {AuthUser} from '../auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {synchronize,overview} from '../../integrations/trello/service.js';
import {normalizeBoard} from '../../integrations/trello/normalize.js';
import {boardFixture,boardId,listId} from '../../integrations/trello/fixtures.js';
import {CodeReviewService} from '../code-review/service.js';
import type {ChatGPTService} from '../../providers/chatgpt/service.js';
import {codeSourceFetcher} from '../code-review/fixtures.js';
import {OperationService,initialOperations} from './service.js';
import {claimJob,finishJob} from '../supervision/jobs.js';
import {analyzeSources} from '../supervision/analyze.js';
import {readTrackingPolicy} from '../tracking/policy.js';
import {acknowledgeAlert,alertOverview,persistAlerts} from './alerts.js';

describe.skipIf(process.env.RUN_OPERATIONS_DB_TESTS!=='true')('PostgreSQL scheduled supervision and alerts',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,projectId:string,actor:AuthUser,service:OperationService,code:CodeReviewService;
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    database={query:client.query.bind(client),connect:async()=>({query:async(sql:string,values?:unknown[])=>{if(sql.startsWith('BEGIN'))return client.query('SAVEPOINT operations_test');if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT operations_test');if(sql==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT operations_test');return client.query('RELEASE SAVEPOINT operations_test');}return client.query(sql,values);},release:()=>{}})} as unknown as TrelloDatabase;
    projectId=(await client.query<{id:string}>("INSERT INTO projects(name) VALUES('Scheduled acceptance fixture') RETURNING id")).rows[0]!.id;
    actor=(await client.query<AuthUser>('INSERT INTO users(login,display_name,password_hash) VALUES($1,\'Fixture manager\',\'unusable\') RETURNING *',['ops-'+randomBytes(8).toString('hex')])).rows[0]!;
    await client.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'manager')",[projectId,actor.id]);
    await client.query('INSERT INTO trello_connections(project_id,board_id,operational_list_ids) VALUES($1,$2,$3)',[projectId,boardId,JSON.stringify([listId])]);
    await client.query("INSERT INTO github_connections(project_id,owner,repository,branch) VALUES($1,'example','project','develop')",[projectId]);
    await client.query('INSERT INTO tracking_policy_versions(project_id,version,due_soon_hours,stale_after_minutes,confirmed) VALUES($1,1,72,60,true)',[projectId]);
    code=new CodeReviewService(database,{} as ChatGPTService,null,codeSourceFetcher);
    service=new OperationService(database,{database,trelloCredentials:null,githubToken:null,fetcher:codeSourceFetcher},code);
  });
  afterAll(async()=>{await code?.close();await client?.query('ROLLBACK');client?.release();await pool?.end();});
  it('starts disabled, serializes configuration versions and rejects unconsented AI',async()=>{
    expect((await service.overview(projectId)).configuration).toEqual(initialOperations);
    await expect(service.configure(projectId,actor,{...initialOperations,expectedVersion:0,codeWithAi:true})).rejects.toMatchObject({code:'INVALID_REQUEST'});
    const {version:ignored,...values}=initialOperations;const saved=await service.configure(projectId,actor,{...values,enabled:true,expectedVersion:0});expect(saved.configuration.version).toBe(1);
    await expect(service.configure(projectId,actor,{...values,enabled:true,expectedVersion:0})).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('coalesces missed reads, queues only once and persists a correlated alert once per saved run',async()=>{
    const now=new Date();await client.query('UPDATE operation_cursors SET next_sync=$2 WHERE project_id=$1',[projectId,new Date(now.getTime()-86_400_000)]);
    expect(await service.tick(now)).toBe(true);expect(await service.tick(now)).toBe(false);
    expect((await client.query('SELECT id FROM supervision_jobs WHERE project_id=$1',[projectId])).rows).toHaveLength(1);
    const board=boardFixture();board.cards[0]!.due=new Date(now.getTime()-3_600_000).toISOString();board.cards[0]!.start=new Date(now.getTime()-7_200_000).toISOString();
    await synchronize(database,projectId,actor.id,'api',async()=>({board,observedAt:now}));
    const source=await overview(database,projectId,true),policy=(await readTrackingPolicy(database,projectId))!,job=(await claimJob(database,projectId))!;
    const result=analyzeSources(source,{connection:{owner:'example',repository:'project',branch:'develop',tokenConfigured:false},latest:null,lastAttempt:null},policy,null,now);
    await finishJob(database,job,'succeeded',null,result,policy.version);
    const run=(await client.query('SELECT id FROM supervision_runs WHERE job_id=$1',[job.id])).rows[0]!.id;
    await persistAlerts(client,projectId,run,result,policy.version);
    const alerts=await alertOverview(database,projectId);expect(alerts.alerts.some(row=>row.code==='overdue')).toBe(true);
    const overdue=alerts.alerts.find(row=>row.code==='overdue')!;
    expect(alerts.events.filter(event=>event.alert_id===overdue.id)).toHaveLength(1);
    await acknowledgeAlert(database,projectId,overdue.id,actor,'Coordinate review.','Awaiting functional confirmation.');
    expect((await alertOverview(database,projectId)).events.some(event=>event.action==='cause_confirmed')).toBe(true);
    expect(normalizeBoard(board,boardId,[listId]).items[0]!.due).toBe(board.cards[0]!.due);
  });
  it('reviews changed blobs once and records daily coverage without consuming AI',async()=>{
    const current=(await service.overview(projectId)).configuration,{version,...values}=current;
    await service.configure(projectId,actor,{...values,enabled:false,codeEnabled:true,expectedVersion:version});
    const now=new Date();await client.query('UPDATE operation_cursors SET next_code=$2 WHERE project_id=$1',[projectId,now]);expect(await service.tick(now)).toBe(true);
    const analyses=await client.query('SELECT id,model,status FROM code_analyses WHERE project_id=$1',[projectId]);expect(analyses.rows).toHaveLength(1);expect(analyses.rows[0]).toMatchObject({model:null,status:'ready'});
    await client.query('UPDATE operation_cursors SET next_code=$2 WHERE project_id=$1',[projectId,new Date(now.getTime()+1)]);await service.tick(new Date(now.getTime()+2));
    expect((await client.query('SELECT id FROM code_analyses WHERE project_id=$1',[projectId])).rows).toHaveLength(1);
  });
  it('suspends a schedule when the authorizing manager loses authority',async()=>{
    await client.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[actor.id]);await client.query('UPDATE operation_cursors SET next_code=clock_timestamp(),lease_until=NULL WHERE project_id=$1',[projectId]);await service.tick(new Date(Date.now()+1000));
    const result=await service.overview(projectId);expect(result.cursor?.last_error).toBe('FORBIDDEN');expect(result.cursor?.next_code).toBeNull();
    expect((await client.query('SELECT id FROM operation_runs WHERE project_id=$1 AND status=\'suspended\'',[projectId])).rows).toHaveLength(1);
  });
});
