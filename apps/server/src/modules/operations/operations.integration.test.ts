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
import {codeSourceFetcher,codeFixture} from '../code-review/fixtures.js';
import {blobHash} from '../../integrations/github/code-client.js';
import {OperationService,initialOperations} from './service.js';
import {claimJob,finishJob} from '../supervision/jobs.js';
import {confirmBaseline} from '../supervision/baseline.js';
import {analyzeSources} from '../supervision/analyze.js';
import {readTrackingPolicy} from '../tracking/policy.js';
import {acknowledgeAlert,alertOverview,persistAlerts} from './alerts.js';

describe.skipIf(process.env.RUN_OPERATIONS_DB_TESTS!=='true')('PostgreSQL scheduled supervision and alerts',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,projectId:string,actor:AuthUser,service:OperationService,code:CodeReviewService;
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    // Simulated future ticks must not claim schedules belonging to real projects.
    const query=async(sql:string,values:unknown[]=[])=>{
      const candidate='SELECT project_id FROM operation_cursors WHERE (';
      if(sql.includes(candidate))return client.query(sql.replace(candidate,`SELECT project_id FROM operation_cursors WHERE project_id=$${values.length+1} AND (`),[...values,projectId]);
      return client.query(sql,values);
    };
    database={query,connect:async()=>({query:async(sql:string,values?:unknown[])=>{if(sql.startsWith('BEGIN'))return client.query('SAVEPOINT operations_test');if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT operations_test');if(sql==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT operations_test');return client.query('RELEASE SAVEPOINT operations_test');}return query(sql,values);},release:()=>{}})} as unknown as TrelloDatabase;
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
    await confirmBaseline(database,projectId,actor,0,source.latest!.id);result.baselineVersion=1;result.deviations.push({itemId:board.cards[0]!.id,itemName:board.cards[0]!.name,field:'due',before:'2026-10-01T22:00:00Z',after:board.cards[0]!.due,hoursShift:1});
    result.deviations.push({itemId:'f'.repeat(24),itemName:'Excluded fixture',field:'not_observed',before:{name:'Excluded fixture'},after:null,hoursShift:null});
    result.dependencies.push({itemId:board.cards[0]!.id,itemName:board.cards[0]!.name,predecessorId:null,predecessorWbs:'1.2',code:'cycle',message:'Declared dependency cycle.',evidence:['WBS: 1.2']});
    await finishJob(database,job,'succeeded',null,result,policy.version);
    const run=(await client.query('SELECT id FROM supervision_runs WHERE job_id=$1',[job.id])).rows[0]!.id;
    await persistAlerts(client,projectId,run,result,policy.version);
    const alerts=await alertOverview(database,projectId);expect(alerts.alerts.some(row=>row.code==='overdue')).toBe(true);
    expect(alerts.alerts.filter(row=>row.code==='baseline_deviation')).toHaveLength(2);expect(alerts.alerts.filter(row=>row.code==='dependency_risk')).toHaveLength(1);
    expect(alerts.alerts.find(row=>row.item_id==='f'.repeat(24))!.payload.assessment.alternatives.map((option:{family:string})=>option.family)).toEqual(['keep_plan']);
    const overdue=alerts.alerts.find(row=>row.code==='overdue')!;
    expect(alerts.events.filter(event=>event.alert_id===overdue.id)).toHaveLength(1);
    await expect(acknowledgeAlert(database,projectId,overdue.id,actor,'Stale observation.','Incorrectly bound cause.','0'.repeat(64))).rejects.toMatchObject({code:'CONFLICT'});
    await acknowledgeAlert(database,projectId,overdue.id,actor,'Coordinate review.','Awaiting functional confirmation.',overdue.payload.sourceCardHash);
    expect((await alertOverview(database,projectId)).events.some(event=>event.action==='cause_confirmed')).toBe(true);
    expect(normalizeBoard(board,boardId,[listId]).items[0]!.due).toBe(board.cards[0]!.due);
  });
  it('reviews changed blobs once and records daily coverage without consuming AI',async()=>{
    const current=(await service.overview(projectId)).configuration,{version,...values}=current;
    await service.configure(projectId,actor,{...values,enabled:false,codeEnabled:true,expectedVersion:version});
    const now=new Date();await client.query('UPDATE operation_cursors SET next_code=$2 WHERE project_id=$1',[projectId,now]);expect(await service.tick(now)).toBe(true);
    const analyses=await client.query('SELECT id,model,status FROM code_analyses WHERE project_id=$1',[projectId]);expect(analyses.rows).toHaveLength(1);expect(analyses.rows[0]).toMatchObject({model:null,status:'ready'});
    expect((await client.query("SELECT actor_type,actor_id FROM audit_events WHERE project_id=$1 AND action='code.analysis' AND resource_id=$2",[projectId,analyses.rows[0]!.id])).rows).toEqual([{actor_type:'system',actor_id:null}]);
    expect((await client.query('SELECT requested_by FROM code_analyses WHERE id=$1',[analyses.rows[0]!.id])).rows[0]!.requested_by).toBe(actor.id);
    await client.query('UPDATE operation_cursors SET next_code=$2 WHERE project_id=$1',[projectId,new Date(now.getTime()+1)]);await service.tick(new Date(now.getTime()+2));
    expect((await client.query('SELECT id FROM code_analyses WHERE project_id=$1',[projectId])).rows).toHaveLength(1);
  });
  it('detects changed content in another commit and conserves the earlier analysis',async()=>{
    const fixture=codeFixture(),content=fixture.files[0]!.content.replace('eval(input)','JSON.parse(input)'),sha=blobHash(content),head='c'.repeat(40),tree='d'.repeat(40);
    const fetcher:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname;if(path.includes('/commits/'))return Response.json({sha:head,commit:{tree:{sha:tree}}});if(path.includes('/git/trees/'))return Response.json({sha:tree,truncated:false,tree:[{...fixture.inventory[0]!,sha,size:Buffer.byteLength(content)}]});return Response.json({sha,encoding:'base64',size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')});};
    const changedCode=new CodeReviewService(database,{} as ChatGPTService,null,fetcher),scheduled=new OperationService(database,{database,trelloCredentials:null,githubToken:null,fetcher},changedCode);
    try{const {version,...values}=(await scheduled.overview(projectId)).configuration;await scheduled.configure(projectId,actor,{...values,enabled:false,codeEnabled:true,expectedVersion:version});
      const now=new Date();await client.query('UPDATE operation_cursors SET next_code=$2 WHERE project_id=$1',[projectId,now]);await scheduled.tick(now);
      const sources=(await client.query('SELECT source FROM code_sources WHERE project_id=$1',[projectId])).rows;expect(sources.some(row=>row.source.head===fixture.head)).toBe(true);expect(sources.some(row=>row.source.head===head&&row.source.files[0].blobSha===sha)).toBe(true);
    }finally{await changedCode.close();}
  });
  it('resumes a pending batch without repeating covered files or exceeding the daily budget',async()=>{
    const fixture=codeFixture(),inventory=Array.from({length:6},(_,index)=>({...fixture.inventory[0]!,path:`src/file${index}.ts`}));
    const fetcher:typeof fetch=async(input,options)=>String(input).includes('/git/trees/')?Response.json({sha:fixture.treeSha,truncated:false,tree:inventory}):codeSourceFetcher(input,options);
    const requests=new Map<string,{id:string;paths:string[]}>();let pending=true;
    const fake={validateScheduledProvider:async()=>{},analyze:async(_binding:unknown,_actor:unknown,request:{requestKey:string;paths:string[]})=>{if(!requests.has(request.requestKey))requests.set(request.requestKey,{id:randomUUID(),paths:request.paths});return requests.get(request.requestKey)!;},analysis:async(_project:string,id:string)=>{const request=[...requests.values()].find(value=>value.id===id)!;return {status:request.paths.length===1&&pending?'running':'ready'};}} as unknown as CodeReviewService;
    const scheduled=new OperationService(database,{database,trelloCredentials:null,githubToken:null,fetcher},fake);
    const {version,...values}=(await scheduled.overview(projectId)).configuration;
    await scheduled.configure(projectId,actor,{...values,enabled:false,codeEnabled:true,codeWithAi:true,model:'synthetic-model',reasoningEffort:'medium',consent:true,maxFiles:5,expectedVersion:version});
    const now=new Date();await client.query('UPDATE operation_cursors SET next_code=$2,lease_until=NULL WHERE project_id=$1',[projectId,now]);
    await scheduled.tick(now);expect(requests.size).toBe(2);
    const first=(await client.query('SELECT code_inventory,last_error FROM operation_cursors WHERE project_id=$1',[projectId])).rows[0]!;
    expect(Object.keys(first.code_inventory).filter(path=>path.startsWith('src/file'))).toHaveLength(4);expect(first.last_error).toBe('CODE_ANALYSIS_PENDING');
    pending=false;await client.query('UPDATE operation_cursors SET lease_until=NULL WHERE project_id=$1',[projectId]);await scheduled.tick(new Date(now.getTime()+16*60_000));expect(requests.size).toBe(2);
    const completed=(await client.query("SELECT detail,status FROM operation_runs WHERE project_id=$1 AND configuration_version=$2 AND kind='code' AND occurrence=$3",[projectId,version+1,now])).rows[0]!;
    expect(completed.status).toBe('partial');expect(completed.detail.reviewed).toHaveLength(5);expect(new Set(completed.detail.reviewed).size).toBe(5);expect(completed.detail.deferred).toEqual(['src/file5.ts']);
  });
  it('suspends after bounded source failures instead of retrying indefinitely',async()=>{
    const unavailable:typeof fetch=async()=>{throw new Error('Synthetic unavailable transport');};
    const scheduled=new OperationService(database,{database,trelloCredentials:null,githubToken:null,fetcher:unavailable},code);
    const {version,...values}=(await scheduled.overview(projectId)).configuration;
    await scheduled.configure(projectId,actor,{...values,enabled:false,codeEnabled:true,codeWithAi:false,model:null,reasoningEffort:null,consent:false,expectedVersion:version});
    const now=new Date();await client.query('UPDATE operation_cursors SET next_code=$2 WHERE project_id=$1',[projectId,now]);
    for(let attempt=0;attempt<3;attempt++){await client.query('UPDATE operation_cursors SET lease_until=NULL WHERE project_id=$1',[projectId]);await scheduled.tick(new Date(now.getTime()+attempt*16*60_000));}
    const state=await scheduled.overview(projectId);expect(state.cursor?.next_code).toBeNull();expect(state.runs.some(run=>run.status==='suspended')).toBe(true);
    const {version:currentVersion,...current}=state.configuration;await scheduled.configure(projectId,actor,{...current,expectedVersion:currentVersion});
  });
  it('suspends a schedule when the authorizing manager loses authority',async()=>{
    await client.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[actor.id]);await client.query('UPDATE operation_cursors SET next_code=clock_timestamp(),lease_until=NULL WHERE project_id=$1',[projectId]);await service.tick(new Date(Date.now()+1000));
    const result=await service.overview(projectId);expect(result.cursor?.last_error).toBe('FORBIDDEN');expect(result.cursor?.next_code).toBeNull();
    expect((await client.query('SELECT id FROM operation_runs WHERE project_id=$1 AND status=\'suspended\' AND detail->>\'errorCode\'=\'FORBIDDEN\'',[projectId])).rows).toHaveLength(1);
  });
  it('never claims another project during simulated future ticks',async()=>{
    const otherId=(await client.query<{id:string}>("INSERT INTO projects(name) VALUES('Untouched scheduling fixture') RETURNING id")).rows[0]!.id;
    await client.query('INSERT INTO operation_configurations(project_id,version,enabled,interval_minutes,code_enabled,code_hour,max_files,changed_by,auth_version) VALUES($1,1,true,60,false,18,64,$2,$3)',[otherId,actor.id,actor.auth_version]);
    await client.query("INSERT INTO operation_cursors(project_id,configuration_version,next_sync,updated_at) VALUES($1,1,clock_timestamp(),clock_timestamp()-interval '1 day')",[otherId]);
    const before=(await client.query('SELECT * FROM operation_cursors WHERE project_id=$1',[otherId])).rows[0];
    expect(await service.tick(new Date(Date.now()+86_400_000))).toBe(false);
    expect((await client.query('SELECT * FROM operation_cursors WHERE project_id=$1',[otherId])).rows[0]).toEqual(before);
    expect((await client.query('SELECT id FROM operation_runs WHERE project_id=$1',[otherId])).rows).toHaveLength(0);
    expect((await client.query('SELECT id FROM supervision_jobs WHERE project_id=$1',[otherId])).rows).toHaveLength(0);
  });
});
