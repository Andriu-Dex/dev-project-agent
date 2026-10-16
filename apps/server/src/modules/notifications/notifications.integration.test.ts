import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {AuthUser} from '../auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {NotificationService} from './service.js';
import {defaultSettings,type NotificationSettings} from './settings.js';
import {MailError,type MailMessage} from './smtp.js';
describe.skipIf(process.env.RUN_NOTIFICATIONS_DB_TESTS!=='true')('Durable notification delivery',()=>{
  let pool:pg.Pool,client:pg.PoolClient,database:TrelloDatabase,projectId:string,actor:AuthUser,service:NotificationService;
  const messages:MailMessage[]=[];let failure:string|null=null,version=0;
  const settings={...defaultSettings,enabled:true,recipient:'manager@example.com',mode:'immediate' as const,quietEnabled:false,reminderHours:0,events:['report_ready' as const]};
  beforeAll(async()=>{
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});client=await pool.connect();await client.query('BEGIN');
    const query=async(sql:string,values?:unknown[])=>{
      if(sql.startsWith('BEGIN'))return client.query('SAVEPOINT notification_test');if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT notification_test');if(sql==='ROLLBACK')return client.query('ROLLBACK TO SAVEPOINT notification_test');return client.query(sql,values);
    };
    database={query,connect:async()=>({query,release:()=>{}})} as unknown as TrelloDatabase;
    projectId=(await client.query("INSERT INTO projects(name) VALUES('Mail acceptance fixture') RETURNING id")).rows[0].id;
    actor=(await client.query("INSERT INTO users(login,display_name,password_hash) VALUES($1,'Fixture manager','unusable') RETURNING *",['mail-'+randomBytes(8).toString('hex')])).rows[0];
    await client.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'manager')",[projectId,actor.id]);
    service=new NotificationService(database,{verify:async()=>{},send:async message=>{messages.push(message);if(failure)throw new MailError(failure);}},'CONFIGURED');
  });
  afterAll(async()=>{await client?.query('ROLLBACK');client?.release();await pool?.end();});
  async function save(values:NotificationSettings=settings){await service.configure(projectId,actor,version,values);version++;}
  async function event(){await client.query("INSERT INTO notification_events(project_id,event_key,kind,source_id,summary,occurred_at) VALUES($1,$2,'report_ready',$2,'A new report is available.',clock_timestamp())",[projectId,randomUUID()]);}
  it('starts disabled, validates recipient and serializes configurations',async()=>{
    expect((await service.overview(projectId)).settings.enabled).toBe(false);
    await expect(service.configure(projectId,actor,0,{...settings,recipient:''})).rejects.toMatchObject({code:'INVALID_REQUEST'});
    await save();await expect(service.configure(projectId,actor,0,settings)).rejects.toMatchObject({code:'CONFLICT'});
  });
  it('groups events, sends once and preserves exact destination without replay',async()=>{
    await event();await event();await service.tick(projectId);await service.tick(projectId);
    expect(messages).toHaveLength(1);expect(messages[0]!.to).toBe(settings.recipient);
    const rows=(await client.query('SELECT status,event_ids FROM notification_deliveries WHERE project_id=$1',[projectId])).rows;
    expect(rows).toHaveLength(1);expect(rows[0].status).toBe('accepted');expect(rows[0].event_ids).toHaveLength(2);
  });
  it('does not blindly retry an uncertain SMTP result',async()=>{
    failure='SMTP_RESULT_UNCERTAIN';await event();await service.tick(projectId);const count=messages.length;await service.tick(projectId);
    expect(messages).toHaveLength(count);expect((await service.overview(projectId)).deliveries.some((d:{status:string})=>d.status==='uncertain')).toBe(true);failure=null;
  });
  it('keeps test requests idempotent and independent from automatic activation',async()=>{
    await save({...settings,enabled:false});const key=randomUUID(),one=await service.test(projectId,actor,key),two=await service.test(projectId,actor,key);expect(one.id).toBe(two.id);
    const count=messages.length;await service.tick(projectId,new Date(Date.now()+1000));expect(messages).toHaveLength(count+1);
  });
  it('cancels queued messages on configuration changes and revocation',async()=>{
    await save({...settings,mode:'digest',digestTime:'23:59'});await event();await service.tick(projectId);
    const count=messages.length;await save({...settings,enabled:false});await service.tick(projectId);expect(messages).toHaveLength(count);
    expect((await service.overview(projectId)).deliveries.some((d:{status:string})=>d.status==='cancelled')).toBe(true);
    await save();await event();await client.query('UPDATE users SET active=false WHERE id=$1',[actor.id]);await service.tick(projectId);expect(messages).toHaveLength(count);
    await expect(service.configure(projectId,actor,version,settings)).rejects.toMatchObject({code:'FORBIDDEN'});await client.query('UPDATE users SET active=true WHERE id=$1',[actor.id]);
  });
  it('only notifies new alert openings unless existing alerts are explicitly included',async()=>{
    const id=(await client.query("INSERT INTO project_alerts(project_id,item_id,code,first_seen,last_seen,payload) VALUES($1,'fixture-card','overdue',clock_timestamp(),clock_timestamp(),$2) RETURNING id",[projectId,JSON.stringify({finding:{itemName:'Overdue fixture',message:'The expected due date has passed.'}})])).rows[0].id;
    await client.query("INSERT INTO alert_events(project_id,alert_id,action) VALUES($1,$2,'opened')",[projectId,id]);
    await save({...settings,events:['overdue']});let count=messages.length;await service.tick(projectId);expect(messages).toHaveLength(count);
    await service.configure(projectId,actor,version,{...settings,events:['overdue']},true);version++;
    await service.tick(projectId);expect(messages).toHaveLength(++count);expect(messages.at(-1)!.text).toContain('Overdue fixture');
    await service.tick(projectId);expect(messages).toHaveLength(count);
    await client.query("UPDATE project_alerts SET status='resolved' WHERE id=$1",[id]);
  });
  it('merges observations into the same pending digest',async()=>{
    await save({...settings,mode:'digest',digestTime:'23:59',maxPerDay:1});const count=messages.length;
    await event();await service.tick(projectId);await event();await service.tick(projectId);
    const pending=(await client.query("SELECT event_ids FROM notification_deliveries WHERE project_id=$1 AND configuration_version=$2 AND status='queued'",[projectId,version])).rows;
    expect(pending).toHaveLength(1);expect(pending[0].event_ids).toHaveLength(2);expect(messages).toHaveLength(count);
    await service.tick(projectId,new Date(Date.now()+24*3600000));expect(messages).toHaveLength(count+1);
    await event();await service.tick(projectId,new Date(Date.now()+24*3600000));expect(messages).toHaveLength(count+1);
  });
  it('defers a due message after the accepted daily budget has been consumed',async()=>{
    await save({...settings,maxPerDay:1});await event();const count=messages.length,now=new Date();await service.tick(projectId,now);
    expect(messages).toHaveLength(count);
    const pending=(await client.query("SELECT next_attempt FROM notification_deliveries WHERE project_id=$1 AND configuration_version=$2 AND status='queued'",[projectId,version])).rows;
    expect(pending).toHaveLength(1);expect(pending[0].next_attempt.getUTCHours()).toBe(5);expect(pending[0].next_attempt>now).toBe(true);
  });
  it('retries a definite temporary rejection only after the bounded delay',async()=>{
    await save();await event();failure='SMTP_TEMPORARY_FAILURE';const now=new Date();await service.tick(projectId,now);const count=messages.length;
    await service.tick(projectId,now);expect(messages).toHaveLength(count);failure=null;
    await service.tick(projectId,new Date(now.getTime()+5*60000+1000));expect(messages).toHaveLength(count+1);
    const row=(await client.query("SELECT status,attempt_count FROM notification_deliveries WHERE project_id=$1 AND configuration_version=$2",[projectId,version])).rows[0];expect(row).toMatchObject({status:'accepted',attempt_count:2});
  });
  it('marks an interrupted sending intent uncertain instead of replaying it',async()=>{
    await save();await event();
    await client.query("INSERT INTO notification_deliveries(project_id,configuration_version,request_key,recipient,kind,status,next_attempt) VALUES($1,$2,$3,$4,'test','sending',clock_timestamp()-interval '6 minutes')",[projectId,version,randomUUID(),settings.recipient]);
    const count=messages.length;await service.tick(projectId);
    const rows=(await client.query("SELECT status,error_code FROM notification_deliveries WHERE project_id=$1 AND configuration_version=$2 AND kind='test'",[projectId,version])).rows;expect(rows[0]).toEqual({status:'uncertain',error_code:'PROCESS_INTERRUPTED'});expect(messages.length-count).toBe(1);
  });
  it('does not turn excluded historical alerts into reminders',async()=>{
    const id=(await client.query("INSERT INTO project_alerts(project_id,item_id,code,first_seen,last_seen,payload) VALUES($1,'historical-unnotified','overdue',clock_timestamp(),clock_timestamp(),$2) RETURNING id",[projectId,JSON.stringify({finding:{itemName:'Historical excluded fixture',message:'A prior alert.'}})])).rows[0].id;
    await client.query("INSERT INTO alert_events(project_id,alert_id,action) VALUES($1,$2,'opened')",[projectId,id]);
    await save({...settings,events:['overdue'],reminderHours:1});const count=messages.length;
    await service.tick(projectId,new Date(Date.now()+2*3600000));expect(messages).toHaveLength(count);
    expect((await client.query('SELECT id FROM notification_events WHERE project_id=$1 AND source_id=$2',[projectId,id])).rows).toHaveLength(0);
  });

});
