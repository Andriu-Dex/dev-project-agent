import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {ChatGPTService} from './service.js';
import type {ConnectionBinding} from './connection.js';
import {CredentialVault,openTokens} from './vault.js';
describe.skipIf(process.env.RUN_RENEWAL_DB_TESTS!=='true')('PostgreSQL renewable ChatGPT access',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,binding:ConnectionBinding,vault:CredentialVault,service:ChatGPTService;
  const key=randomBytes(32),models=[{slug:'test-model',displayName:'Modelo sintético'}],tokens={accessToken:'SYNTHETIC_ACCESS_SECRET',refreshToken:'SYNTHETIC_REFRESH_SECRET',clientId:'oaiapp_synthetic',subject:'synthetic-subject'};
  let calls=0,mode:'ok'|'transient'|'terminal'|'uncertain'='ok',pause:Promise<void>|null=null,started:()=>void=()=>{};
  const fetcher:typeof fetch=async(input,options)=>{
    const url=new URL(String(input));if(url.pathname.includes('openid-configuration'))return Response.json({revocation_endpoint:'https://auth.openai.com/oauth/revoke'});
    if(url.pathname==='/oauth/revoke')return new Response(null,{status:200});
    if(url.pathname==='/v1/responses')return new Response('data: {"type":"response.output_text.delta","delta":"{\\"status\\":\\"ok\\"}"}\n\ndata: {"type":"response.completed"}\n\n');
    calls++;const body=new URLSearchParams(String(options!.body));expect(body.get('client_id')).toBe(tokens.clientId);expect(body.get('scope')).toBeNull();
    if(pause){started();await pause;}if(mode==='transient')return new Response(null,{status:503});if(mode==='terminal')return Response.json({error:'invalid_grant'},{status:400});if(mode==='uncertain')throw new Error('Connection lost after request.');
    return Response.json({access_token:'SYNTHETIC_NEW_ACCESS_'+calls,refresh_token:'SYNTHETIC_NEW_REFRESH_'+calls,expires_in:3600});
  };
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    database={query:client.query.bind(client),connect:async()=>client} as unknown as TrelloDatabase;
    const projectId=(await client.query("INSERT INTO projects(name) VALUES('Renewal verification') RETURNING id")).rows[0].id;
    const userId=(await client.query('INSERT INTO users(login,display_name,password_hash) VALUES($1,$2,$3) RETURNING id',['renewal-'+randomUUID(),'Synthetic manager','test-hash'])).rows[0].id;
    await client.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'manager')",[projectId,userId]);
    binding={projectId,userId,authVersion:1,sessionId:'synthetic-session'};
    await client.query('INSERT INTO chatgpt_registrations(project_id,user_id,client_id,subject) VALUES($1,$2,$3,$4)',[projectId,userId,tokens.clientId,tokens.subject]);
    vault=new CredentialVault(database,key,fetcher);service=new ChatGPTService({database,credentialKey:key,callbackOrigin:'http://127.0.0.1:3100',fetcher});
  });
  beforeEach(async()=>{calls=0;mode='ok';pause=null;await client.query('UPDATE users SET active=true,auth_version=1 WHERE id=$1',[binding.userId]);await vault.save(binding,tokens,Date.now()+30_000,models,0);service.connections.disconnectAccount(binding);});
  afterAll(async()=>{if(service)await service.close();if(client){await client.query('ROLLBACK');client.release();}if(pool)await pool.end();});
  it('restores access after a service restart and browser logout without another OAuth flow',async()=>{
    await service.ensureConnection(binding);expect(service.connections.credentials(binding,'test-model').token).toContain('SYNTHETIC_NEW_ACCESS');
    service.connections.disconnectSession(binding.sessionId);
    const next={...binding,sessionId:'new-browser-session'};await service.ensureConnection(next);expect(service.connections.view(next).status).toBe('connected');expect(calls).toBe(1);
    const restarted=new ChatGPTService({database,credentialKey:key,callbackOrigin:'http://127.0.0.1:3100',fetcher});try{await restarted.ensureConnection(next);expect(restarted.connections.view(next).status).toBe('connected');expect(calls).toBe(1);}finally{await restarted.close();}
    const stored=(await client.query('SELECT * FROM chatgpt_credentials WHERE project_id=$1',[binding.projectId])).rows[0];expect(JSON.stringify(stored)).not.toContain('SYNTHETIC_');expect(openTokens(key,binding,stored.ciphertext).refreshToken).toContain('SYNTHETIC_NEW_REFRESH');
  });
  it('serializes rotating refreshes and fences another service process',async()=>{
    let release:()=>void=()=>{};pause=new Promise(resolve=>{release=resolve;});const entered=new Promise<void>(resolve=>{started=resolve;});
    const first=vault.ensure(binding),duplicate=vault.ensure(binding);await entered;
    const other=new CredentialVault(database,key,fetcher);await expect(other.ensure(binding)).rejects.toHaveProperty('code','REFRESH_IN_PROGRESS');release();await Promise.all([first,duplicate]);expect(calls).toBe(1);
  });
  it('keeps valid credentials during temporary outages and applies bounded retry backoff',async()=>{
    mode='transient';const first=await vault.ensure(binding);expect(first!.state).toBe('active');expect(first!.ciphertext).toBeTruthy();expect(first!.retry_at!.getTime()).toBeGreaterThan(Date.now());
    await vault.ensure(binding);expect(calls).toBe(1);expect((await service.overview(binding,true)).connection.renewable).toBe(true);
  });
  it('clears terminal grants and never repeats an ambiguous rotation',async()=>{
    for(const current of ['terminal','uncertain'] as const){mode=current;await vault.save(binding,tokens,Date.now()+30_000,models,0);const before=calls;
      await expect(vault.ensure(binding)).rejects.toHaveProperty('code',current==='terminal'?'REFRESH_REAUTHORIZATION_REQUIRED':'REFRESH_UNCERTAIN');
      const row=(await client.query('SELECT * FROM chatgpt_credentials WHERE project_id=$1',[binding.projectId])).rows[0];expect(row.ciphertext).toBeNull();expect(row.state).toBe('reauthorization_required');
      await expect(vault.ensure(binding)).rejects.toThrow();expect(calls-before).toBe(1);
    }
  });
  it('renews in the background and respects earliest refresh time',async()=>{
    await vault.save(binding,tokens,Date.now()+30_000,models,Date.now()+20_000);await vault.renewAll();expect(calls).toBe(0);
    await vault.save(binding,tokens,Date.now()+30_000,models,0);await vault.renewAll();expect(calls).toBe(1);expect((await vault.metadata(binding)).lastRefreshedAt).not.toBeNull();
  });
  it('requires reauthorization after an interrupted persisted rotation',async()=>{
    await client.query("UPDATE chatgpt_credentials SET state='refreshing' WHERE project_id=$1",[binding.projectId]);await vault.recover();await expect(vault.ensure(binding)).rejects.toHaveProperty('code','REFRESH_UNCERTAIN');expect(calls).toBe(0);
  });
  it('cancels every browser cache and revokes saved renewable access on disconnect',async()=>{
    await service.ensureConnection(binding);const other={...binding,sessionId:'other'};await service.ensureConnection(other);const credentials=service.connections.credentials(other,'test-model');
    expect(await service.disconnect(binding)).toEqual({remoteRevocationConfirmed:true});expect(credentials.signal.aborted).toBe(true);await service.ensureConnection(other);expect(service.connections.view(other).status).toBe('disconnected');expect((await vault.metadata(binding)).renewable).toBe(false);
  });
  it('does not restore or refresh grants after manager authority changes',async()=>{
    await client.query('UPDATE users SET auth_version=2 WHERE id=$1',[binding.userId]);await expect(service.ensureConnection(binding)).rejects.toHaveProperty('code','FORBIDDEN');expect(calls).toBe(0);
    await vault.renewAll();expect((await client.query('SELECT ciphertext FROM chatgpt_credentials WHERE project_id=$1',[binding.projectId])).rows[0].ciphertext).toBeNull();
    // Reauthorization can replace a grant after a background permission check has begun.
    await vault.save(binding,tokens,Date.now()+30_000,models,0);let replaced=false;
    const racingDatabase={...database,query:async(text:string,values:unknown[])=>{
      const result=await client.query(text,values);
      if(text.startsWith('SELECT u.id FROM users')&&!replaced){replaced=true;await vault.save({...binding,authVersion:2},tokens,Date.now()+3600_000,models,0);}
      return result;
    }} as unknown as TrelloDatabase;
    await new CredentialVault(racingDatabase,key,fetcher).renewAll();
    const newer=(await client.query('SELECT auth_version,ciphertext,state FROM chatgpt_credentials WHERE project_id=$1',[binding.projectId])).rows[0];
    expect(newer.auth_version).toBe(2);expect(newer.state).toBe('active');expect(newer.ciphertext).toBeTruthy();expect(calls).toBe(0);

  });
  it('does not expose encrypted tokens, subject or client mapping to the panel',async()=>{
    const overview=await service.overview(binding,true),viewer=await service.overview(binding,false);expect(overview.connection.renewable).toBe(true);expect(viewer.connection.models).toEqual([]);
    const audit=(await client.query('SELECT * FROM audit_events WHERE project_id=$1',[binding.projectId])).rows;
    expect(JSON.stringify([overview,viewer,audit])).not.toMatch(/SYNTHETIC_|oaiapp_synthetic|synthetic-subject/);
  });
});
