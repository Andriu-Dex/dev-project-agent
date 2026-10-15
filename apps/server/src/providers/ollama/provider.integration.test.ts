import {ChatGPTService} from '../chatgpt/service.js';
import type {AuthUser} from '../../modules/auth/repository.js';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {buildApp} from '../../app.js';
import {hashPassword} from '../../modules/auth/password.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {OllamaService} from './service.js';
import {evaluationCases} from '../chatgpt/evaluation.js';

describe.skipIf(process.env.RUN_PROVIDER_DB_TESTS!=='true')('PostgreSQL Ollama panel workflow', () => {
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,app:ReturnType<typeof buildApp>,service:OllamaService,projectId:string;
  const origin='http://127.0.0.1:5174',loginName='ollama-'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
  let headers:Record<string,string>,viewerHeaders:Record<string,string>;

  const cookie=(response:{headers:Record<string,unknown>})=>{
    const values=response.headers['set-cookie'];
    return (Array.isArray(values)?values:[values]).reverse().find(v=>typeof v==='string'&&v.startsWith('dpa_session='))?.split(';')[0] as string;
  };

  const fetcher:typeof fetch=async(input,options)=>{
    const url=new URL(String(input));
    if(url.pathname==='/api/tags') {
      return Response.json({
        models:[
          {
            name:'qwen2.5-coder:7b',
            size:4683087561,
            modified_at:'2026-10-14T00:00:00Z',
            details:{format:'gguf',family:'qwen2',parameter_size:'7.6B',quantization_level:'Q4_K_M'},
          },
        ],
      });
    }

    if(url.pathname==='/api/chat') {
      const body=JSON.parse(String(options?.body));
      const userMsg=body.messages.find((m:{role:string})=>m.role==='user');
      const data=JSON.parse(userMsg.content);
      const test=evaluationCases.find(v=>v.id===data.caseId)!;
      const output={
        caseId:test.id,
        classification:test.classification,
        evidenceIds:test.evidence.map(v=>v.id),
        requiresHumanApproval:true,
        recommendation:'Revisar con el gestor.',
        unknowns:['Causa y aceptación no informadas.'],
      };
      return Response.json({
        model:'qwen2.5-coder:7b',
        message:{role:'assistant',content:JSON.stringify(output)},
        prompt_eval_count:40,
        eval_count:30,
      });
    }

    return new Response('Not found',{status:404});
  };

  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
    client=await pool.connect();
    await client.query('BEGIN');
    let queue:Promise<void>=Promise.resolve();
    const query=(sql:string,values?:unknown[])=>{
      const result=queue.then(()=>client.query(sql,values));
      queue=result.then(()=>{},()=>{});
      return result;
    };
    database={
      query,
      connect:async()=>({
        query:async(sql:string,values?:unknown[])=>{
          if(sql==='BEGIN')return query('SAVEPOINT ollama_test');
          if(sql==='COMMIT')return query('RELEASE SAVEPOINT ollama_test');
          if(sql==='ROLLBACK'){await query('ROLLBACK TO SAVEPOINT ollama_test');return query('RELEASE SAVEPOINT ollama_test');}
          return query(sql,values);
        },
        release:()=>{},
      }),
    } as unknown as TrelloDatabase;

    projectId=(await client.query("INSERT INTO projects (name) VALUES ('Ollama verification') RETURNING id")).rows[0].id;
    const passwordHash=await hashPassword(password);
    for(const role of ['manager','viewer']){
      const user=(await client.query('INSERT INTO users (login,display_name,password_hash) VALUES ($1,$2,$3) RETURNING id',[loginName+'-'+role,role,passwordHash])).rows[0];
      await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)',[projectId,user.id,role]);
    }

    service=new OllamaService({database,baseUrl:'http://127.0.0.1:11434',fetcher});
    await service.initialize();
    app=buildApp({
      checkDatabase:async()=>{},
      auth:{database,sessionSecret:randomBytes(48).toString('hex'),allowedOrigins:[origin],secureCookies:false,ollama:service},
    });
    headers=await login('manager');
    viewerHeaders=await login('viewer');
  });

  afterAll(async()=>{
    if(service)await service.close();
    if(app)await app.close();
    if(client){await client.query('ROLLBACK');client.release();}
    if(pool)await pool.end();
  });

  async function login(role:string){
    const anonymous=await app.inject({method:'GET',url:'/api/v1/session'});
    const response=await app.inject({
      method:'POST',
      url:'/api/v1/session/login',
      headers:{origin,cookie:cookie(anonymous),'x-csrf-token':anonymous.json().csrfToken},
      payload:{login:loginName+'-'+role,password},
    });
    expect(response.statusCode).toBe(200);
    return {origin,cookie:cookie(response),'x-csrf-token':response.json().csrfToken as string};
  }

  const path=()=>`/api/v1/projects/${projectId}/ollama`;

  it('enforces authentication and project membership', async () => {
    expect((await app.inject({method:'GET',url:path()})).statusCode).toBe(401);
    expect((await app.inject({method:'GET',url:`/api/v1/projects/${randomUUID()}/ollama`,headers})).statusCode).toBe(404);
  });

  it('returns overview with detected models', async () => {
    const response=await app.inject({method:'GET',url:path(),headers});
    expect(response.statusCode).toBe(200);
    const body=response.json();
    expect(body.connection.status).toBe('connected');
    expect(body.connection.models).toHaveLength(1);
    expect(body.connection.models[0].name).toBe('qwen2.5-coder:7b');
  });

  it('requires manager role to start evaluations', async () => {
    const response=await app.inject({
      method:'POST',
      url:`${path()}/evaluations`,
      headers:viewerHeaders,
      payload:{model:'qwen2.5-coder:7b',requestKey:randomUUID()},
    });
    expect(response.statusCode).toBe(403);
  });

  it('runs evaluations and saves passed results', async () => {
    const requestKey=randomUUID();
    const response=await app.inject({
      method:'POST',
      url:`${path()}/evaluations`,
      headers,
      payload:{model:'qwen2.5-coder:7b',requestKey},
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('running');

    await service.waitForIdle();

    const overviewRes=await app.inject({method:'GET',url:path(),headers});
    expect(overviewRes.statusCode).toBe(200);
    const overview=overviewRes.json();
    expect(overview.evaluations).toHaveLength(1);
    expect(overview.evaluations[0].status).toBe('passed');
    expect(overview.evaluations[0].provider).toBe('ollama');
    expect(overview.evaluations[0].result.passed).toBe(6);
    expect(overview.evaluations[0].result.total).toBe(6);
  });
  it('keeps provider recovery isolated and rejects cross-provider request-key reuse',async()=>{
    const actor=(await client.query<AuthUser>('SELECT * FROM users WHERE login=$1',[loginName+'-manager'])).rows[0]!;
    const requestKey=randomUUID();
    await client.query("INSERT INTO provider_evaluations(project_id,requested_by,request_key,model,suite_version,status,provider) VALUES($1,$2,$3,$4,'fixture','passed','chatgpt')",[projectId,actor.id,requestKey,'qwen2.5-coder:7b']);
    await expect(service.evaluate(projectId,actor,'qwen2.5-coder:7b',requestKey)).rejects.toMatchObject({code:'CONFLICT'});
    const row=(await client.query("INSERT INTO provider_evaluations(project_id,requested_by,request_key,model,suite_version,status,provider) VALUES($1,$2,$3,$4,'fixture','running','ollama') RETURNING id",[projectId,actor.id,randomUUID(),'qwen2.5-coder:7b'])).rows[0]!;
    const remote=new ChatGPTService({database,callbackOrigin:origin});
    try {await remote.initialize();expect((await client.query('SELECT status FROM provider_evaluations WHERE id=$1',[row.id])).rows[0].status).toBe('running');}
    finally{await remote.close();}
    await service.initialize();expect((await client.query('SELECT status FROM provider_evaluations WHERE id=$1',[row.id])).rows[0].status).toBe('interrupted');
  });

});
