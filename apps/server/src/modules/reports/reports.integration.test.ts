import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {buildApp} from '../../app.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {boardFixture,boardId,listId} from '../../integrations/trello/fixtures.js';
import {normalizeBoard} from '../../integrations/trello/normalize.js';
import {hashPassword} from '../auth/password.js';
import type {AuthUser} from '../auth/repository.js';
import {ReportService} from './service.js';
import {renderReport} from './render.js';
import {fingerprint} from '../proposals/contracts.js';
describe.skipIf(process.env.RUN_REPORTS_DB_TESTS!=='true')('PostgreSQL weekly reports',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,service:ReportService,app:ReturnType<typeof buildApp>,actor:AuthUser,viewer:AuthUser,projectId:string;
  const origin='http://127.0.0.1:5174',password=randomBytes(24).toString('hex');
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');let queue:Promise<void>=Promise.resolve();
    const query=(sql:string,values?:unknown[])=>{const result=queue.then(()=>client.query(sql,values));queue=result.then(()=>{},()=>{});return result;};
    database={query,connect:async()=>({query:async(sql:string,values?:unknown[])=>{if(sql.startsWith('BEGIN'))return query('SAVEPOINT report_operation');if(sql==='COMMIT')return query('RELEASE SAVEPOINT report_operation');if(sql==='ROLLBACK'){await query('ROLLBACK TO SAVEPOINT report_operation');return query('RELEASE SAVEPOINT report_operation');}return query(sql,values);},release:()=>{}})} as unknown as TrelloDatabase;
    const hash=await hashPassword(password);
    actor=(await client.query<AuthUser>('INSERT INTO users(login,display_name,password_hash) VALUES($1,$2,$3) RETURNING *',['report-manager-'+randomUUID(),'Gestor sintético',hash])).rows[0]!;
    viewer=(await client.query<AuthUser>('INSERT INTO users(login,display_name,password_hash) VALUES($1,$2,$3) RETURNING *',['report-viewer-'+randomUUID(),'Consulta sintética',hash])).rows[0]!;
    service=new ReportService(database);app=buildApp({checkDatabase:async()=>{},auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,reports:service}});await app.ready();
  });
  beforeEach(async()=>{
    projectId=(await client.query("INSERT INTO projects(name,created_at) VALUES('Proyecto de reporte','2026-09-01T00:00:00Z') RETURNING id")).rows[0].id;
    for(const user of [actor,viewer])await client.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[projectId,user.id,user.id===actor.id?'manager':'viewer']);
    await client.query('INSERT INTO trello_connections(project_id,board_id,operational_list_ids) VALUES($1,$2,$3)',[projectId,boardId,JSON.stringify([listId])]);
    await client.query("INSERT INTO tracking_policy_versions(project_id,version,due_soon_hours,stale_after_minutes,confirmed,changed_at) VALUES($1,1,72,60,true,'2026-09-01T00:00:00Z')",[projectId]);
  });
  afterAll(async()=>{if(app)await app.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  async function snapshot(at='2026-10-01T12:00:00Z',name='Actividad sintética',completed=false){const board=boardFixture();board.cards[0]!.name=name;board.cards[0]!.labels=[{name:completed?'COMPLETADA':'PENDIENTE'}];board.cards[0]!.dueComplete=completed;const data=normalizeBoard(board,boardId,[listId]);return (await client.query('INSERT INTO trello_snapshots(project_id,source,observed_at,imported_at,data,changes) VALUES($1,\'api\',$2,$2,$3,\'[]\') RETURNING id',[projectId,new Date(at),JSON.stringify(data)])).rows[0].id as string;}
  async function generate(){const job=await service.request(projectId,actor,randomUUID());while(await service.processNext()){}return (await service.detail(projectId,job.id))!;}
  async function activate(){return service.configure(projectId,actor,{expectedVersion:0,enabled:true,weekday:5,hour:18,minute:0});}
  async function historicalSchedule(){await activate();await client.query("UPDATE report_schedule_cursors SET period_start='2026-09-25T23:00:00Z',next_cutoff='2026-10-02T23:00:00Z' WHERE project_id=$1",[projectId]);}
  it('starts disabled and versions manager-controlled dynamic schedules',async()=>{
    expect(await service.schedule(projectId)).toMatchObject({enabled:false,version:0,weekday:5,hour:18,minute:0});const configured=await activate();expect(configured.version).toBe(1);expect(configured.nextCutoff).toMatch(/23:00:00.000Z$/);
    await expect(service.configure(projectId,actor,{expectedVersion:0,enabled:false,weekday:5,hour:18,minute:0})).rejects.toHaveProperty('code','CONFLICT');
    await expect(service.configure(projectId,viewer,{expectedVersion:1,enabled:false,weekday:5,hour:18,minute:0})).rejects.toHaveProperty('code','FORBIDDEN');
  });
  it('recovers every missed occurrence with its original period and no duplicates',async()=>{
    await snapshot();await historicalSchedule();await service.enqueueScheduled(new Date('2026-10-11T20:00:00Z'));await service.enqueueScheduled(new Date('2026-10-11T20:00:00Z'));
    const overview=await service.overview(projectId);expect(overview.reports).toHaveLength(2);expect(overview.reports.map(report=>report.cutoff).sort()).toEqual(['2026-10-02T23:00:00.000Z','2026-10-09T23:00:00.000Z']);
    while(await service.processNext()){}const first=(await service.detail(projectId,overview.reports.find(report=>report.cutoff.startsWith('2026-10-02'))!.id))!;expect(first.data).toMatchObject({late:true,periodStart:'2026-09-25T23:00:00.000Z',cutoff:'2026-10-02T23:00:00.000Z'});expect(first.status).toBe('published');
  });
  it('persists the formula, evidence identifiers and three deterministic publication stages',async()=>{
    const id=await snapshot();const report=await generate();expect(report.status).toBe('published');expect(report.data!.tracking!.summary!.progress).toMatchObject({numerator:0,denominator:1,percent:0,basis:'declared_completion'});
    expect(report.data!.sources[0]).toMatchObject({id,timing:'before_cutoff'});expect(report.data!.stages.map(stage=>stage.stage)).toEqual(['executor','reviewer','approver']);expect(report.contentHash).toBe(fingerprint(report.data));expect(report.data!.code).toBeNull();
  });
  it('keeps missing planning evidence in a draft rather than publishing invented progress',async()=>{
    const report=await generate();expect(report.status).toBe('draft');expect(report.data!.tracking).toBeNull();expect(report.data!.stages.find(stage=>stage.stage==='reviewer')!.outcome).toBe('fail');expect(report.data!.executiveSummary).toContain('No hay evidencia');
  });
  it('links risk recommendations to observed assignees and dates without assigning new commitments',async()=>{
    await snapshot();const report=await generate();
    const recommendation=report.data!.recommendations.find(value=>value.startsWith('Actividad sintética:'));
    expect(recommendation).toContain('Responsable registrado: Test member.');
    expect(recommendation).toContain('Vencimiento observado (Ecuador):');
    expect(recommendation).toContain('no asignan ni comprometen una nueva fecha');
  });
  it('deduplicates manual requests and creates another immutable version on correction',async()=>{
    await snapshot();const key=randomUUID(),first=await service.request(projectId,actor,key),duplicate=await service.request(projectId,actor,key);expect(duplicate.id).toBe(first.id);while(await service.processNext()){}
    const original=(await service.detail(projectId,first.id))!,revision=await service.request(projectId,actor,randomUUID(),first.id);expect(revision.version).toBe(2);expect(revision.cutoff).toBe(first.cutoff);while(await service.processNext()){}expect(await service.detail(projectId,first.id)).toEqual(original);
    await expect(service.request(projectId,actor,key,first.id)).rejects.toHaveProperty('code','CONFLICT');
  });
  it('compares progress in percentage points only for the same activity universe',async()=>{
    await snapshot('2026-10-01T12:00:00Z');await snapshot('2026-10-05T12:00:00Z','Actividad sintética',true);await historicalSchedule();await service.enqueueScheduled(new Date('2026-10-10T00:00:00Z'));while(await service.processNext()){}
    const latest=(await service.detail(projectId,(await service.overview(projectId)).reports[0]!.id))!;expect(latest.data!.progressChangePoints).toBe(100);
    const board=boardFixture();board.cards.push({...board.cards[0]!,id:'e'.repeat(24)});await client.query("INSERT INTO trello_snapshots(project_id,source,observed_at,imported_at,data,changes) VALUES($1,'api','2026-10-10T12:00:00Z','2026-10-10T12:00:00Z',$2,'[]')",[projectId,JSON.stringify(normalizeBoard(board,boardId,[listId]))]);
    const changed=await generate();expect(changed.data!.activityUniverse).toHaveLength(2);expect(changed.data!.progressChangePoints).toBeNull();
  });
  it('prefers evidence available before the cutoff over a newer observation',async()=>{
    const before=await snapshot('2026-10-01T12:00:00Z','Anterior al corte'),after=await snapshot('2026-10-05T12:00:00Z','Posterior al corte');await historicalSchedule();await service.enqueueScheduled(new Date('2026-10-03T00:00:00Z'));while(await service.processNext()){}
    const report=(await service.detail(projectId,(await service.overview(projectId)).reports[0]!.id))!;expect(report.data!.sources[0]!.id).toBe(before);expect(report.data!.sources[0]!.id).not.toBe(after);expect(report.data!.activities[0]!.name).toBe('Anterior al corte');
  });
  it('labels fallback observations and unavailable historical configurations explicitly',async()=>{
    await snapshot('2026-10-05T12:00:00Z');await historicalSchedule();await client.query("UPDATE tracking_policy_versions SET changed_at='2026-10-05T10:00:00Z' WHERE project_id=$1",[projectId]);await service.enqueueScheduled(new Date('2026-10-03T00:00:00Z'));while(await service.processNext()){}
    const report=(await service.detail(projectId,(await service.overview(projectId)).reports[0]!.id))!;expect(report.data!.sources[0]!.timing).toBe('after_cutoff');expect(report.data!.sources[0]!.ageMinutes).toBeNull();expect(report.data!.limitations.join(' ')).toMatch(/posteriores al corte|después del corte/);expect(report.data!.progressChangePoints).toBeNull();
  });
  it('includes only period events and preserves source text as escaped data',async()=>{
    await snapshot('2026-10-01T12:00:00Z','<img src=x onerror=alert(1)> token=abcdefghijklmnop');
    const analysisId=(await client.query("INSERT INTO code_analyses(project_id,requested_by,request_key,request_hash,status,created_at) VALUES($1,$2,$3,'synthetic','ready','2026-10-01T12:00:00Z') RETURNING id",[projectId,actor.id,randomUUID()])).rows[0].id;
    const proposalId=(await client.query("INSERT INTO code_proposals(project_id,created_by,created_at) VALUES($1,$2,'2026-10-01T12:00:00Z') RETURNING id",[projectId,actor.id])).rows[0].id;
    await client.query("INSERT INTO code_versions(project_id,proposal_id,version,analysis_id,goal,finding_ids,created_at) VALUES($1,$2,1,$3,'Synthetic correction','[]','2026-10-01T12:00:00Z')",[projectId,proposalId,analysisId]);
    await client.query("INSERT INTO code_decisions(project_id,proposal_id,version,actor_id,auth_version,request_key,content_hash,decision,reason,created_at) VALUES($1,$2,1,$3,1,$4,$5,'approved','Sin cambiar GitHub','2026-10-02T12:00:00Z')",[projectId,proposalId,actor.id,randomUUID(),'0'.repeat(64)]);
    for(const [date,action] of [['2026-09-25T23:00:00Z','code.prepare'],['2026-10-02T22:59:59Z','proposal.approved'],['2026-10-02T23:00:00Z','execution.write']])await client.query('INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome,occurred_at) VALUES($1,\'user\',$2,$3,$4,\'synthetic:v1\',\'succeeded\',$5)',[projectId,actor.id,action,action!.startsWith('code')?'code_review':action!.startsWith('execution')?'execution_job':'proposal',date]);
    await historicalSchedule();await service.enqueueScheduled(new Date('2026-10-03T00:00:00Z'));while(await service.processNext()){}const report=(await service.detail(projectId,(await service.overview(projectId)).reports[0]!.id))!;
    expect(report.data!.events.map(event=>event.action)).toEqual(['code.prepare','proposal.approved']);expect(report.data!.actions.map(item=>item.action)).toEqual(['proposed','approved']);expect(report.data!.actions[1]).toMatchObject({proposalId,version:1,purpose:'demonstration',target:'code',outcome:'recorded',actor:'Gestor sintético'});const html=renderReport(report);expect(html).not.toContain('<img src=x');expect(html).toContain('&lt;img src=x');expect(html).not.toContain('abcdefghijklmnop');expect(html).toContain(report.id);expect(html).toContain('Versión 1');expect(html).toContain('Aprobación humana');
  });
  it('does not reconstruct a historical baseline from a confirmation after the cutoff',async()=>{
    const id=await snapshot();await client.query("INSERT INTO baseline_versions(project_id,version,snapshot_id,confirmed_by,confirmed_at) VALUES($1,1,$2,$3,'2026-10-05T12:00:00Z')",[projectId,id,actor.id]);await historicalSchedule();await service.enqueueScheduled(new Date('2026-10-03T00:00:00Z'));while(await service.processNext()){}
    const report=(await service.detail(projectId,(await service.overview(projectId)).reports[0]!.id))!;expect(report.data!.baselineVersion).toBeNull();expect(report.data!.deviations).toEqual([]);
  });
  it('keeps proposals, decisions and a failed publication distinct inside the report period',async()=>{
    await snapshot();
    const analysisId=(await client.query("INSERT INTO code_analyses(project_id,requested_by,request_key,request_hash,status) VALUES($1,$2,$3,'fixture','ready') RETURNING id",[projectId,actor.id,randomUUID()])).rows[0].id;
    const proposalId=(await client.query("INSERT INTO code_proposals(project_id,created_by,purpose) VALUES($1,$2,'live') RETURNING id",[projectId,actor.id])).rows[0].id;
    for(const version of [1,2])await client.query("INSERT INTO code_versions(project_id,proposal_id,version,analysis_id,goal,finding_ids,created_at) VALUES($1,$2,$3,$4,'Report fixture','[]','2026-10-01T12:00:00Z')",[projectId,proposalId,version,analysisId]);
    const approval=(await client.query("INSERT INTO code_decisions(project_id,proposal_id,version,actor_id,auth_version,request_key,content_hash,decision,reason,created_at) VALUES($1,$2,1,$3,1,$4,$5,'approved','Bounded fixture approval','2026-10-01T13:00:00Z') RETURNING id",[projectId,proposalId,actor.id,randomUUID(),'0'.repeat(64)])).rows[0].id;
    await client.query("INSERT INTO code_decisions(project_id,proposal_id,version,actor_id,auth_version,request_key,content_hash,decision,reason,created_at) VALUES($1,$2,2,$3,1,$4,$5,'rejected','Preserve existing implementation','2026-10-01T14:00:00Z')",[projectId,proposalId,actor.id,randomUUID(),'1'.repeat(64)]);
    const job=(await client.query("INSERT INTO github_publication_jobs(project_id,proposal_id,version,content_hash,requested_by,auth_version,request_key,approval_id,plan,status,error_code) VALUES($1,$2,1,$3,$4,1,$5,$6,'{}','failed','REMOTE_REJECTED') RETURNING id",[projectId,proposalId,'0'.repeat(64),actor.id,randomUUID(),approval])).rows[0].id;
    await client.query("INSERT INTO github_publication_events(project_id,job_id,stage,outcome,detail,created_at) VALUES($1,$2,'write','failed',$3,'2026-10-01T15:00:00Z')",[projectId,job,JSON.stringify({actorId:actor.id})]);
    await historicalSchedule();await service.enqueueScheduled(new Date('2026-10-03T00:00:00Z'));while(await service.processNext()){}
    const report=(await service.detail(projectId,(await service.overview(projectId)).reports[0]!.id))!;
    expect(report.data!.actions.filter(action=>action.action==='proposed')).toHaveLength(2);
    expect(report.data!.actions.some(action=>action.action==='approved'&&action.version===1)).toBe(true);
    expect(report.data!.actions.some(action=>action.action==='rejected'&&action.version===2)).toBe(true);
    expect(report.data!.actions.find(action=>action.action==='publication.write')).toMatchObject({outcome:'failed',purpose:'live',target:'code',actor:'Gestor sintético'});
    expect(report.data!.actions.some(action=>action.outcome==='succeeded')).toBe(false);
  });
  it('halts pending generation when manager membership is revoked',async()=>{
    await snapshot();const job=await service.request(projectId,actor,randomUUID());await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);while(await service.processNext()){}expect(await service.detail(projectId,job.id)).toMatchObject({status:'failed',errorCode:'FORBIDDEN',data:null});
  });
  it('suspends a revoked schedule once and requires a fresh manager configuration',async()=>{
    await historicalSchedule();await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);
    for(let index=0;index<2;index++)await service.enqueueScheduled(new Date('2026-10-11T20:00:00Z'));
    expect(await service.schedule(projectId)).toMatchObject({errorCode:'FORBIDDEN'});expect((await service.overview(projectId)).reports).toEqual([]);
    expect((await client.query("SELECT count(*) FROM audit_events WHERE project_id=$1 AND action='report.schedule' AND outcome='denied'",[projectId])).rows[0].count).toBe('1');
    await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);await service.configure(projectId,actor,{expectedVersion:1,enabled:true,weekday:5,hour:18,minute:0});expect((await service.schedule(projectId)).errorCode).toBeNull();
  });
  it('prevents runtime edits and deletion of published content and schedule history',async()=>{
    await snapshot();const report=await generate();await client.query('SAVEPOINT runtime_permissions');await client.query('SET LOCAL ROLE dev_project_agent_app');
    expect((await client.query('SELECT data FROM report_results WHERE report_id=$1',[report.id])).rows).toHaveLength(1);
    await expect(client.query("UPDATE report_results SET data='{}' WHERE report_id=$1",[report.id])).rejects.toHaveProperty('code','42501');await client.query('ROLLBACK TO SAVEPOINT runtime_permissions');await client.query('RELEASE SAVEPOINT runtime_permissions');
  });
  it('enforces panel authentication, viewer read access, manager writes, CSRF and origin',async()=>{
    await snapshot();const report=await generate(),path=`/api/v1/projects/${projectId}/reports`;
    const cookie=(response:{headers:Record<string,unknown>})=>{const values=response.headers['set-cookie'];return (Array.isArray(values)?values:[values]).reverse().find(value=>typeof value==='string'&&value.startsWith('dpa_session='))?.split(';')[0] as string;};
    async function login(user:AuthUser){const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});const response=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:user.login,password}});expect(response.statusCode).toBe(200);return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};}
    expect((await app.inject({method:'GET',url:path})).statusCode).toBe(401);const viewerHeaders=await login(viewer),managerHeaders=await login(actor);
    expect((await app.inject({method:'GET',url:path+'/'+report.id,headers:viewerHeaders})).statusCode).toBe(200);
    const printed=await app.inject({method:'GET',url:path+'/'+report.id+'/print',headers:viewerHeaders});expect(printed.statusCode).toBe(200);expect(printed.headers['cache-control']).toBe('no-store');expect(printed.headers['content-security-policy']).toContain("default-src 'none'");
    expect((await app.inject({method:'POST',url:path,headers:viewerHeaders,payload:{requestKey:randomUUID()}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path,headers:{origin,cookie:managerHeaders.cookie},payload:{requestKey:randomUUID()}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path,headers:{...managerHeaders,origin:'https://evil.example'},payload:{requestKey:randomUUID()}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path,headers:managerHeaders,payload:{requestKey:randomUUID()}})).statusCode).toBe(202);
    expect((await app.inject({method:'GET',url:'/api/v1/projects/'+randomUUID()+'/reports/'+report.id,headers:managerHeaders})).statusCode).toBe(404);
  });
});
