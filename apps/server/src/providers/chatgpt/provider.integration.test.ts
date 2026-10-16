import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {buildApp} from '../../app.js';
import {hashPassword} from '../../modules/auth/password.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {ChatGPTService} from './service.js';
import {evaluationCases} from './evaluation.js';
import type {AuthUser} from '../../modules/auth/repository.js';
import type {ConnectionBinding} from './connection.js';

describe.skipIf(process.env.RUN_PROVIDER_DB_TESTS!=='true')('PostgreSQL ChatGPT panel workflow',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,app:ReturnType<typeof buildApp>,service:ChatGPTService,projectId:string;
  let privateKey:CryptoKey;let nonce='',requestCount=0,mode:'ok'|'quota'|'wrong'='ok';
  let pause:Promise<void>|null=null,signalStarted:()=>void=()=>{};
  const clientId='oaiapp_synthetic',origin='http://127.0.0.1:5174',loginName='provider-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
  let headers:Record<string,string>,viewerHeaders:Record<string,string>;
  const cookie=(response:{headers:Record<string,unknown>})=>{const values=response.headers['set-cookie'];return (Array.isArray(values)?values:[values]).reverse().find(value=>typeof value==='string'&&value.startsWith('dpa_session='))?.split(';')[0] as string;};
  const fetcher:typeof fetch=async(input,options)=>{
    const url=new URL(String(input));
    if(url.hostname==='auth.openai.com'){
      const token=await new SignJWT({nonce}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience(clientId).setSubject('synthetic-user').setIssuedAt().setExpirationTime('2 minutes').sign(privateKey);
      return Response.json({id_token:token,access_token:'SYNTHETIC_ACCESS_SECRET',refresh_token:'SYNTHETIC_REFRESH_SECRET',expires_in:3600,scope:'openid resource.invoke chatgpt.tokens.use.direct'});
    }
    if(url.pathname==='/v1/models')return Response.json({models:[{slug:'test-model',display_name:'Modelo de prueba',visibility:'list'}]});
    requestCount++;
    if(pause){signalStarted();await pause;}
    const body=JSON.parse(String(options!.body));expect(body).toMatchObject({store:false,stream:true,model:'test-model'});expect(body).not.toHaveProperty('tools');
    if(mode==='quota')return new Response('UPSTREAM_PRIVATE_DATA',{status:429});
    const data=JSON.parse(body.input[0].content);const test=evaluationCases.find(value=>value.id===data.caseId)!;
    const output={caseId:test.id,classification:mode==='wrong'?'completed':test.classification,evidenceIds:test.evidence.map(value=>value.id),requiresHumanApproval:true,recommendation:'Revisar con el gestor.',unknowns:['Causa y aceptación no informadas.']};
    return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:JSON.stringify(output)})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{usage:{input_tokens:50,output_tokens:30,total_tokens:80,private:'UPSTREAM_PRIVATE_DATA'}}})+'\n\n');
  };
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    let queue:Promise<void>=Promise.resolve();
    const query=(sql:string,values?:unknown[])=>{const result=queue.then(()=>client.query(sql,values));queue=result.then(()=>{},()=>{});return result;};
    database={query,connect:async()=>({query:async(sql:string,values?:unknown[])=>{
      if(sql==='BEGIN')return query('SAVEPOINT provider_test');if(sql==='COMMIT')return query('RELEASE SAVEPOINT provider_test');
      if(sql==='ROLLBACK'){await query('ROLLBACK TO SAVEPOINT provider_test');return query('RELEASE SAVEPOINT provider_test');}return query(sql,values);
    },release:()=>{}})} as unknown as TrelloDatabase;
    projectId=(await client.query("INSERT INTO projects (name) VALUES ('Provider verification') RETURNING id")).rows[0].id;
    const passwordHash=await hashPassword(password);
    for(const role of ['manager','viewer']){const user=(await client.query('INSERT INTO users (login,display_name,password_hash) VALUES ($1,$2,$3) RETURNING id',[loginName+'-'+role,role,passwordHash])).rows[0];await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)',[projectId,user.id,role]);}
    const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;const key=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'test',alg:'RS256'}]});
    service=new ChatGPTService({database,callbackOrigin:'http://127.0.0.1:3100',fetcher,identityKey:key});await service.initialize();
    app=buildApp({checkDatabase:async()=>{},auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,chatgpt:service}});
    headers=await login('manager');viewerHeaders=await login('viewer');
  });
  afterAll(async()=>{if(service)await service.close();if(app)await app.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  async function login(role:string){const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});const response=await app.inject({method:'POST',url:'/api/v1/session/login',headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},payload:{login:loginName+'-'+role,password}});expect(response.statusCode).toBe(200);return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};}
  const path=()=>`/api/v1/projects/${projectId}/chatgpt`;
  const overview=async()=>{const response=await app.inject({method:'GET',url:path(),headers});expect(response.statusCode).toBe(200);return response.json();};
  async function authorize(){const response=await app.inject({method:'POST',url:path()+'/authorization',headers});expect(response.statusCode).toBe(200);const url=new URL(response.json().authorizationUrl);nonce=url.searchParams.get('nonce')!;return url;}
  function callback(url:URL,state=url.searchParams.get('state')!){return path()+'/callback?'+new URLSearchParams({state,code:'SYNTHETIC_CALLBACK_CODE',client_id:clientId});}
  async function connect(){const url=await authorize();const response=await app.inject({method:'GET',url:callback(url),headers});expect(response.statusCode).toBe(200);expect((await overview()).connection.status).toBe('connected');return url;}
  it('enforces authentication, project membership, manager role, origin and CSRF',async()=>{
    expect((await app.inject({method:'GET',url:path()})).statusCode).toBe(401);
    expect((await app.inject({method:'GET',url:'/api/v1/projects/'+randomUUID()+'/chatgpt',headers})).statusCode).toBe(404);
    expect((await app.inject({method:'GET',url:path(),headers:viewerHeaders})).statusCode).toBe(200);
    for(const endpoint of ['authorization','disconnect','evaluations'])expect((await app.inject({method:'POST',url:path()+'/'+endpoint,headers:viewerHeaders,...(endpoint==='evaluations'?{payload:{model:'test-model',requestKey:randomUUID()}}:{})})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path()+'/authorization',headers:{cookie:headers.cookie,origin}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:path()+'/authorization',headers:{...headers,origin:'https://evil.example'}})).statusCode).toBe(403);
  });
  it('validates callbacks once and keeps tokens outside responses, audit and sessions',async()=>{
    const url=await authorize();const host=url.searchParams.get('ext_agent_host_id');
    expect((await app.inject({method:'GET',url:callback(url,'wrong'),headers})).statusCode).toBe(400);expect((await overview()).connection.status).toBe('pending');
    const other=await login('manager');expect((await app.inject({method:'GET',url:callback(url),headers:other})).statusCode).toBe(503);
    expect((await app.inject({method:'GET',url:callback(url),headers})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:callback(url),headers})).statusCode).toBe(503);
    const saved=await overview();expect(saved.connection.models).toEqual([{slug:'test-model',displayName:'Modelo de prueba'}]);
    expect((await app.inject({method:'POST',url:path()+'/evaluations',headers,payload:{model:'test-model',requestKey:randomUUID(),reasoningEffort:'high'}})).statusCode).toBe(400);
    const audit=await client.query('SELECT * FROM audit_events WHERE project_id=$1',[projectId]);const sessions=await client.query('SELECT payload FROM sessions');
    expect(JSON.stringify([saved,audit.rows,sessions.rows])).not.toMatch(/SYNTHETIC_(ACCESS|REFRESH|CALLBACK)_/);
    const next=await authorize();expect(next.searchParams.get('ext_agent_host_id')).toBe(host);expect(next.searchParams.get('client_id')).toBe(clientId);
    expect((await app.inject({method:'GET',url:callback(next),headers})).statusCode).toBe(200);
  });
  it('persists a six-case evaluation and deduplicates without consuming quota again',async()=>{
    const payload={model:'test-model',requestKey:randomUUID()},before=requestCount;
    const response=await app.inject({method:'POST',url:path()+'/evaluations',headers,payload});expect(response.statusCode).toBe(202);const id=response.json().id;
    await service.waitForIdle();const saved=(await overview()).evaluations[0];expect(saved).toMatchObject({id,status:'passed',result:{passed:6,total:6,requiresHumanReview:true,productionReady:false}});expect(requestCount-before).toBe(6);
    const duplicate=await app.inject({method:'POST',url:path()+'/evaluations',headers,payload});expect(duplicate.json().id).toBe(id);await service.waitForIdle();expect(requestCount-before).toBe(6);
    expect(JSON.stringify(saved)).not.toContain('UPSTREAM_PRIVATE_DATA');
    const viewer=(await app.inject({method:'GET',url:path(),headers:viewerHeaders})).json();expect(viewer.connection.models).toEqual([]);expect(viewer.evaluations[0].id).toBe(id);
  });
  it('reports quota failures without retries and retains earlier immutable results',async()=>{
    mode='quota';const previous=(await overview()).evaluations[0];const before=requestCount;
    const response=await app.inject({method:'POST',url:path()+'/evaluations',headers,payload:{model:'test-model',requestKey:randomUUID()}});expect(response.statusCode).toBe(202);await service.waitForIdle();
    const saved=await overview();expect(saved.evaluations[0]).toMatchObject({status:'failed',errorCode:'USAGE_LIMIT',result:{passed:0,total:6}});expect(requestCount-before).toBe(1);
    expect(saved.evaluations.find((value:{id:string})=>value.id===previous.id)).toEqual(previous);expect(JSON.stringify(saved)).not.toContain('UPSTREAM_PRIVATE_DATA');mode='ok';
  });
  it('clears credentials on logout and marks interrupted work without replaying it',async()=>{
    const before=requestCount;await client.query("INSERT INTO provider_evaluations (project_id,requested_by,request_key,model,suite_version,status) SELECT $1,u.id,$2,'test-model','tracking-synthetic-v1','running' FROM users u WHERE login=$3",[projectId,randomUUID(),loginName+'-manager']);
    await service.initialize();expect((await overview()).evaluations[0]).toMatchObject({status:'interrupted',errorCode:'SERVICE_RESTARTED'});expect(requestCount).toBe(before);
    expect((await app.inject({method:'POST',url:path()+'/disconnect',headers})).statusCode).toBe(204);expect((await overview()).connection.status).toBe('disconnected');
    await connect();expect((await app.inject({method:'POST',url:'/api/v1/session/logout',headers})).statusCode).toBe(204);headers=await login('manager');expect((await overview()).connection.status).toBe('disconnected');
  });
  async function syntheticConnection(){
    const actor=(await client.query<AuthUser>('SELECT * FROM users WHERE login=$1',[loginName+'-manager'])).rows[0]!;
    const binding:ConnectionBinding={projectId,userId:actor.id,authVersion:actor.auth_version,sessionId:'synthetic-evaluation-session'};
    service.connections.begin(binding,'http://127.0.0.1/callback',clientId,'synthetic-user');const consumed=service.connections.consume(binding);
    service.connections.complete(binding,consumed.entry,'SYNTHETIC_ACCESS_SECRET',3600,[{slug:'test-model',displayName:'Test model'}]);
    return {actor,binding};
  }
  it('blocks overlapping evaluations and stops after a manager loses authority during inference',async()=>{
    const {actor,binding}=await syntheticConnection();let release:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{signalStarted=resolve;});pause=new Promise<void>(resolve=>{release=resolve;});
    const before=requestCount,key=randomUUID(),first=await service.evaluate(binding,actor,'test-model',key);await started;
    expect((await service.evaluate(binding,actor,'test-model',key)).id).toBe(first.id);
    await expect(service.evaluate(binding,actor,'test-model',randomUUID())).rejects.toMatchObject({code:'CONFLICT'});
    await client.query('UPDATE project_memberships SET active=false WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);
    try{pause=null;release();await service.waitForIdle();const result=await client.query('SELECT status,error_code FROM provider_evaluations WHERE id=$1',[first.id]);expect(result.rows[0]).toEqual({status:'failed',error_code:'FORBIDDEN'});expect(requestCount-before).toBe(1);}
    finally{pause=null;release();await service.waitForIdle();await client.query('UPDATE project_memberships SET active=true WHERE project_id=$1 AND user_id=$2',[projectId,actor.id]);}
  });
  it('does not publish a response from a disconnected session or falsely pass wrong classifications',async()=>{
    const {actor,binding}=await syntheticConnection();let release:()=>void=()=>{};
    const started=new Promise<void>(resolve=>{signalStarted=resolve;});pause=new Promise<void>(resolve=>{release=resolve;});
    const before=requestCount,first=await service.evaluate(binding,actor,'test-model',randomUUID());await started;service.connections.disconnect(binding);pause=null;release();await service.waitForIdle();
    const failed=(await client.query('SELECT e.status,r.result FROM provider_evaluations e JOIN provider_evaluation_results r ON r.evaluation_id=e.id WHERE e.id=$1',[first.id])).rows[0];
    expect(failed.status).toBe('failed');expect(failed.result.cases).toEqual([]);expect(requestCount-before).toBe(1);
    const next=await syntheticConnection();mode='wrong';
    try{const evaluation=await service.evaluate(next.binding,next.actor,'test-model',randomUUID());await service.waitForIdle();const row=(await client.query('SELECT e.status,r.result FROM provider_evaluations e JOIN provider_evaluation_results r ON r.evaluation_id=e.id WHERE e.id=$1',[evaluation.id])).rows[0];expect(row.status).toBe('failed');expect(row.result.passed).toBe(1);expect(row.result.productionReady).toBe(false);}
    finally{mode='ok';}
  });
});
