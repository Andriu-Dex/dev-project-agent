import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import type {AuthUser} from '../auth/repository.js';
import type {AgentProvider} from '../../providers/agents.js';
import {blobHash} from '../../integrations/github/code-client.js';
import {CoverageService} from './coverage.js';
import {coverageDefaults} from './coverage-policy.js';
import {CodeError} from './evidence.js';
import {buildApp} from '../../app.js';
import {hashPassword} from '../auth/password.js';
import {ReportService} from '../reports/service.js';
import {renderReport} from '../reports/render.js';

describe.skipIf(process.env.RUN_COVERAGE_DB_TESTS!=='true')('PostgreSQL progressive repository coverage',()=>{
  let pool:pg.Pool,service:CoverageService,projectId:string,actor:AuthUser;
  let content:Record<string,string>,head:string,truncated:boolean,failed:boolean,reads:string[],providerCalls:number;
  let provider:AgentProvider;
  const fetcher:typeof fetch=async(input,options)=>{
    expect(options?.method).toBe('GET');const url=new URL(String(input));expect(url.hostname).toBe('api.github.com');
    if(url.pathname.includes('/commits/'))return Response.json({sha:head,commit:{tree:{sha:'b'.repeat(40)}}});
    if(url.pathname.includes('/git/trees/'))return Response.json({sha:'b'.repeat(40),truncated,tree:Object.entries(content).map(([path,value])=>({path,type:'blob',mode:'100644',sha:blobHash(value),size:Buffer.byteLength(value)}))});
    const found=Object.entries(content).find(([,value])=>url.pathname.endsWith(blobHash(value)));
    if(found){reads.push(found[0]);if(failed)return Response.json({}, {status:503});return Response.json({sha:blobHash(found[1]),size:Buffer.byteLength(found[1]),encoding:'base64',content:Buffer.from(found[1]).toString('base64')});}
    return Response.json({}, {status:404});
  };
  beforeAll(async()=>{pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5});});
  afterAll(async()=>{await pool?.end();});
  beforeEach(async()=>{
    content={'src/a.ts':"import {b} from './b';\nexport const a=b;",'src/b.ts':'export const b=1;','package-lock.json':'{}','image.png':'binary','.env.example':'placeholder'};
    head='a'.repeat(40);truncated=false;failed=false;reads=[];providerCalls=0;
    projectId=(await pool.query("INSERT INTO projects(name) VALUES('Progressive review fixture') RETURNING id")).rows[0].id;
    actor=(await pool.query<AuthUser>("INSERT INTO users(login,display_name,password_hash) VALUES($1,'Coverage manager','unusable') RETURNING *",['coverage-'+randomUUID()])).rows[0]!;
    await pool.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'manager')",[projectId,actor.id]);
    await pool.query("INSERT INTO github_connections(project_id,owner,repository,branch) VALUES($1,'example','project','develop')",[projectId]);
    provider={ensureConnection:async()=>{},connections:{credentials:()=>({entry:{}})},generate:async()=>{providerCalls++;return {model:'fixture',durationMs:1,usage:{total_tokens:10},output:{summary:'Revisión acotada sin ejecutar el proyecto.',findings:[],limitations:['Los alias no se resuelven.']}};}};
    service=new CoverageService(pool,provider,null,fetcher);
  });
  async function inventory(){return service.inventory(projectId,actor,(await service.overview(projectId)).revision);}
  async function configure(extra:Partial<typeof coverageDefaults>={}){const overview=await service.overview(projectId);return service.configure(projectId,actor,overview.revision,{...overview.settings,...extra});}
  async function control(action:'start'|'pause'|'retry'){return service.control(projectId,actor,(await service.overview(projectId)).revision,action);}
  async function tick(){await pool.query('UPDATE code_coverage_projects SET next_run=clock_timestamp()-interval \'1 minute\' WHERE project_id=$1',[projectId]);await service.tick();}
  async function files(){return (await service.files(projectId,null,'',1)).files;}
  it('starts unconfigured and inventories eligible content separately from exclusions',async()=>{
    expect((await service.overview(projectId)).head).toBe(null);
    const overview=await inventory();expect(overview.enabled).toBe(false);expect(overview.counts.pending).toBe(2);expect(overview.counts.excluded).toBe(3);expect(reads).toEqual([]);
    expect((await service.files(projectId,'excluded','env',1)).total).toBe(1);
    await expect(service.inventory(projectId,actor,0)).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('continues durable batches across service instances without repeating completed files',async()=>{
    await inventory();await configure({batchUnits:1});await control('start');await tick();
    expect((await service.overview(projectId)).counts.reviewed).toBe(1);
    service=new CoverageService(pool,provider,null,fetcher);await tick();
    expect((await service.overview(projectId)).counts.reviewed).toBe(2);
    const count=(await pool.query('SELECT id FROM code_coverage_results WHERE project_id=$1',[projectId])).rowCount;
    await tick();expect((await pool.query('SELECT id FROM code_coverage_results WHERE project_id=$1',[projectId])).rowCount).toBe(count);
    expect(reads).not.toContain('.env.example');expect(reads).not.toContain('package-lock.json');await control('pause');
  });
  it('splits large files, preserves original line numbers and leaves contextual work partial',async()=>{
    content={'src/large.ts':Array.from({length:180},(_,index)=>`export const value${index} = ${index};`).join('\n')};
    await inventory();await configure({batchUnits:1,partBytes:1000});await control('start');await tick();
    expect((await files())[0]).toMatchObject({state:'partial',completedParts:1});
    for(let index=0;index<10;index++)await tick();
    const file=(await files())[0]!;expect(file.completedParts).toBe(file.totalParts);expect(file.state).toBe('partial');
    const results=await service.results(projectId,file.path);expect(results.length).toBe(file.totalParts);expect(results.every(value=>value.result.checks.every((check:{status:string})=>check.status==='not_checked'))).toBe(true);
    expect(Math.max(...results.map(value=>value.lineEnd))).toBe(180);await control('pause');
  });
  it('invalidates changed files and consumers transitively and keeps historical evidence',async()=>{
    content['src/c.ts']="import {a} from './a';\nexport const c=a;";
    await inventory();await control('start');await tick();await control('pause');
    expect((await service.overview(projectId)).counts.reviewed).toBe(3);
    content['src/b.ts']='export const b=2;';head='c'.repeat(40);await inventory();
    expect((await service.overview(projectId)).counts.outdated).toBe(3);
    expect((await service.results(projectId,'src/a.ts'))[0].current).toBe(false);
  });
  it('never retries sensitive content automatically and does not persist it in results',async()=>{
    content={'src/safe.ts':'export const a=1;','src/private.ts':"const token='ghp_12345678901234567890';"};
    await inventory();await control('start');await tick();const first=reads.filter(path=>path==='src/private.ts').length;await tick();
    expect((await files()).find(file=>file.path==='src/private.ts')).toMatchObject({state:'excluded',reason:'sensitive_source'});
    expect(reads.filter(path=>path==='src/private.ts').length).toBe(first);expect(await service.results(projectId,'src/private.ts')).toEqual([]);await control('pause');
  });
  it('bounds failures and enables explicit retries without discarding completed results',async()=>{
    content={'src/a.ts':'export const a=1;'};await inventory();await configure({maxAttempts:2});failed=true;await control('start');await tick();await tick();
    expect((await files())[0]).toMatchObject({state:'failed',attempts:2});const attempts=reads.length;await tick();expect(reads.length).toBe(attempts);
    await control('pause');await control('retry');failed=false;await control('start');await tick();expect((await files())[0]!.state).toBe('reviewed');await control('pause');
  });
  it('rejects incomplete inventories without erasing prior coverage',async()=>{
    await inventory();truncated=true;await expect(inventory()).rejects.toMatchObject({code:'INCOMPLETE_SOURCE'});expect((await files()).length).toBe(5);
  });
  it('requires AI consent and retains the explicitly selected provider per batch',async()=>{
    await inventory();await expect(configure({withAi:true,model:'ollama:fixture',consent:false})).rejects.toMatchObject({code:'CONSENT_REQUIRED'});
    await configure({withAi:true,model:'ollama:fixture',consent:true,partBytes:8000,contextBytes:4000});await control('start');await tick();
    expect(providerCalls).toBe(2);expect((await service.results(projectId,'src/a.ts'))[0].settings.model).toBe('ollama:fixture');await control('pause');
  });
  it('pauses provider quota failures without falling back to another model',async()=>{
    await inventory();provider.generate=async()=>{providerCalls++;throw new CodeError('USAGE_LIMIT');};await configure({withAi:true,model:'gpt-6.1-sol',consent:true});await control('start');await tick();
    const overview=await service.overview(projectId);expect(overview.enabled).toBe(false);expect(overview.lastError).toBe('USAGE_LIMIT');expect(providerCalls).toBe(1);
  });
  it('recovers an expired lease and prevents concurrent batch claims',async()=>{
    await inventory();await control('start');await pool.query("UPDATE code_coverage_projects SET lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute' WHERE project_id=$1",[projectId]);
    expect(await service.tick()).toBe(false);await pool.query("UPDATE code_coverage_projects SET lease_until=clock_timestamp()-interval '1 minute' WHERE project_id=$1",[projectId]);await tick();expect((await service.overview(projectId)).counts.reviewed).toBe(2);await control('pause');
  });
  it('stops after manager authority is revoked',async()=>{
    await inventory();await control('start');await pool.query("UPDATE project_memberships SET role='viewer' WHERE project_id=$1 AND user_id=$2",[projectId,actor.id]);await tick();expect((await service.overview(projectId)).enabled).toBe(false);expect(reads).toEqual([]);
  });
  it('preserves report-cut coverage and does not substitute later results',async()=>{
    await inventory();const reports=new ReportService(pool),job=await reports.request(projectId,actor,randomUUID());
    await control('start');await tick();await control('pause');
    while(await reports.processNext()){}
    const report=await reports.detail(projectId,job.id);
    expect(report?.data?.codeCoverage?.counts).toMatchObject({pending:2,reviewed:0,excluded:3});
    expect(renderReport(report!)).toContain('Cobertura progresiva guardada al corte');
    expect((await service.overview(projectId)).counts.reviewed).toBe(2);
  });
  it('preserves immutable evidence permissions for the runtime role',async()=>{
    const permissions=(await pool.query("SELECT has_table_privilege('dev_project_agent_app','code_coverage_results','UPDATE') AS update,has_table_privilege('dev_project_agent_app','code_coverage_results','DELETE') AS delete,has_table_privilege('dev_project_agent_app','code_coverage_snapshots','UPDATE') AS snapshot_update,has_column_privilege('dev_project_agent_app','code_coverage_batches','settings','UPDATE') AS settings_update")).rows[0];
    expect(permissions).toEqual({update:false,delete:false,snapshot_update:false,settings_update:false});
  });
  it('pauses between fragments and rejects changing settings during a running batch',async()=>{
    await inventory();let release:()=>void=()=>{},started:()=>void=()=>{};
    const reached=new Promise<void>(resolve=>{started=resolve;}),wait=new Promise<void>(resolve=>{release=resolve;});
    const generate=provider.generate;provider.generate=async(...args)=>{started();await wait;return generate(...args);};
    await configure({withAi:true,model:'gpt-6.1-sol',consent:true});await control('start');const batch=tick();await reached;
    try{await expect(configure({batchUnits:2})).rejects.toMatchObject({code:'CONFLICT'});await control('pause');}finally{release();await batch;}
    expect((await service.overview(projectId)).counts.reviewed).toBe(1);
    expect((await files()).some(file=>file.state==='reviewing')).toBe(false);
  });
  it('keeps deleted files out of the current denominator and retains their evidence',async()=>{
    await inventory();await control('start');await tick();await control('pause');delete content['src/a.ts'];head='d'.repeat(40);await inventory();
    expect((await service.overview(projectId)).counts.reviewed).toBe(1);
    expect((await service.files(projectId,null,'src/a',1)).total).toBe(0);
    expect((await service.results(projectId,'src/a.ts')).length).toBe(1);
  });
  it('protects all routes with session, membership, manager role, CSRF and strict schemas',async()=>{
    const password=randomBytes(24).toString('hex');await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1',[actor.id,await hashPassword(password)]);
    const app=buildApp({checkDatabase:async()=>{},auth:{database:pool,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:['http://127.0.0.1:5174'],secureCookies:false,coverage:service}});
    const root=`/api/v1/projects/${projectId}/code-review/coverage`;
    try{
      expect((await app.inject({method:'GET',url:root})).statusCode).toBe(401);
      const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});const cookie=(response:{headers:Record<string,unknown>})=>{const raw=response.headers['set-cookie'];return(Array.isArray(raw)?raw:[raw]).reverse().find(value=>String(value).startsWith('dpa_session='))?.split(';')[0] as string;};
      const login=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin:'http://127.0.0.1:5174',cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:actor.login,password}});
      expect(login.statusCode).toBe(200);const headers={origin:'http://127.0.0.1:5174',cookie:cookie(login),'x-csrf-token':login.json().csrfToken};
      expect((await app.inject({method:'POST',url:root+'/inventory',headers,payload:{expectedRevision:0}})).statusCode).toBe(200);
      expect((await app.inject({method:'POST',url:root+'/control',headers:{cookie:headers.cookie},payload:{expectedRevision:1,action:'start'}})).statusCode).toBe(403);
      expect((await app.inject({method:'POST',url:root+'/control',headers,payload:{expectedRevision:1,action:'start',unexpected:true}})).statusCode).toBe(400);
      await pool.query("UPDATE project_memberships SET role='viewer' WHERE project_id=$1 AND user_id=$2",[projectId,actor.id]);
      expect((await app.inject({method:'GET',url:root,headers})).statusCode).toBe(200);
      expect((await app.inject({method:'POST',url:root+'/control',headers,payload:{expectedRevision:1,action:'start'}})).statusCode).toBe(403);
      expect((await app.inject({method:'GET',url:root.replace(projectId,randomUUID()),headers})).statusCode).toBe(404);
    }finally{await app.close();}
  });
});
