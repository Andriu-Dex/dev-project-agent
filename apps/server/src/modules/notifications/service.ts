import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {AuthUser} from '../auth/repository.js';
import {assertManager} from '../supervision/access.js';
import {reportText} from '../reports/service.js';
import {defaultSettings,deliveryTime,renderNotification,validateSettings,type NotificationSettings} from './settings.js';
import {MailError,mailFailure,type MailTransport} from './smtp.js';

interface Configuration {project_id:string;version:number;settings:NotificationSettings;changed_by:string;auth_version:number;changed_at:Date}
interface Delivery {id:string;project_id:string;configuration_version:number;recipient:string;kind:string;event_ids:string[];attempt_count:number;next_attempt:Date}
const names:Record<string,string>={overdue:'Actividad vencida',blocked:'Bloqueo informado',due_soon:'PrÃ³ximo vencimiento',baseline_deviation:'DesviaciÃ³n de planificaciÃ³n',dependency_risk:'Riesgo de dependencia'};
export class NotificationService {
  constructor(readonly database:TrelloDatabase,readonly transport:MailTransport|null,readonly smtpStatus:string,readonly baseUrl='http://127.0.0.1:5174',private sensitiveValues:string[]=[]){}
  private protect(value:string){for(const secret of this.sensitiveValues)if(secret.length>=8)value=value.split(secret).join('[dato protegido]');return reportText(value);}
  private async transaction<T>(operation:(client:pg.PoolClient)=>Promise<T>){const client=await this.database.connect();try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  private async audit(db:Pick<pg.PoolClient,'query'>,projectId:string,actorId:string|null,action:string,id:string,outcome='succeeded'){
    await db.query('INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,$2,$3,$4,\'notification\',$5,$6)',[projectId,actorId?'user':'system',actorId,action,id,outcome]);
  }
  async overview(projectId:string){
    const config=(await this.database.query<Configuration>('SELECT * FROM notification_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];
    const deliveries=(await this.database.query('SELECT id,configuration_version,recipient,kind,status,attempt_count,error_code,created_at,finished_at,next_attempt FROM notification_deliveries WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50',[projectId])).rows;
    const history=(await this.database.query('SELECT version,changed_at FROM notification_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 20',[projectId])).rows;
    const active=(await this.database.query("SELECT count(*)::int AS count FROM project_alerts WHERE project_id=$1 AND status<>'resolved'",[projectId])).rows[0]?.count??0;
    return {version:config?.version??0,settings:config?.settings??defaultSettings,smtpStatus:this.smtpStatus,deliveries,history,activeAlerts:active,timeZone:'America/Guayaquil',nextDigest:config?.settings.enabled&&config.settings.mode==='digest'?deliveryTime(config.settings,new Date()).toISOString():null};
  }
  async configure(projectId:string,actor:AuthUser,expectedVersion:number,settings:NotificationSettings,includeExisting=false){
    validateSettings(settings);if(settings.enabled&&!this.transport)throw new MailError(this.smtpStatus);
    await this.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['notifications:'+projectId]);await assertManager(db,projectId,actor);
      const previous=(await db.query<Configuration>('SELECT * FROM notification_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];if((previous?.version??0)!==expectedVersion)throw new MailError('CONFLICT');
      const config=(await db.query<Configuration>('INSERT INTO notification_configurations(project_id,version,settings,changed_by,auth_version) VALUES($1,$2,$3,$4,$5) RETURNING *',[projectId,expectedVersion+1,JSON.stringify(settings),actor.id,actor.auth_version])).rows[0]!;
      await db.query("UPDATE notification_deliveries SET status='cancelled',error_code='CONFIGURATION_CHANGED',finished_at=clock_timestamp() WHERE project_id=$1 AND status='queued'",[projectId]);
      if(includeExisting&&settings.enabled)await this.seedActive(db,config,new Date());
      await this.audit(db,projectId,actor.id,'notifications.configure',String(config.version));
    });return this.overview(projectId);
  }
  async verify(projectId:string,actor:AuthUser){await assertManager(this.database,projectId,actor);if(!this.transport)throw new MailError(this.smtpStatus);await this.transport.verify();await this.audit(this.database,projectId,actor.id,'notifications.verify','smtp');return {verified:true};}
  async test(projectId:string,actor:AuthUser,requestKey:string){
    if(!this.transport)throw new MailError(this.smtpStatus);
    return this.transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['notifications:'+projectId]);await assertManager(db,projectId,actor);
      const config=(await db.query<Configuration>('SELECT * FROM notification_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[projectId])).rows[0];
      if(!config?.settings.recipient)throw new MailError('RECIPIENT_REQUIRED');
      const same=(await db.query('SELECT id,status FROM notification_deliveries WHERE project_id=$1 AND request_key=$2',[projectId,requestKey])).rows[0];if(same)return same;
      const recent=(await db.query("SELECT id FROM notification_deliveries WHERE project_id=$1 AND kind='test' AND created_at>clock_timestamp()-interval '1 minute'",[projectId])).rows[0];if(recent)throw new MailError('TEST_RATE_LIMITED');
      const row=(await db.query("INSERT INTO notification_deliveries(project_id,configuration_version,request_key,recipient,kind,status) VALUES($1,$2,$3,$4,'test','queued') RETURNING id,status",[projectId,config.version,requestKey,config.settings.recipient])).rows[0];
      await this.audit(db,projectId,actor.id,'notifications.test',row.id);return row;
    });
  }
  private async seedActive(db:Pick<pg.PoolClient,'query'>,config:Configuration,now:Date){
    const alerts=(await db.query<{id:string;code:string;payload:{finding:{itemName:string;message:string}};last_seen:Date}>("SELECT id,code,payload,last_seen FROM project_alerts WHERE project_id=$1 AND status<>'resolved' AND code=ANY($2::text[]) LIMIT 200",[config.project_id,config.settings.events])).rows;
    for(const alert of alerts)await this.addEvent(db,config,`existing:${config.version}:${alert.id}`,alert.code,alert.id,`${names[alert.code]}: ${alert.payload.finding.itemName}. ${alert.payload.finding.message} Evidencia: ${alert.last_seen.toISOString()}.`,now);
  }
  private async addEvent(db:Pick<pg.PoolClient,'query'>,config:Configuration,key:string,kind:string,source:string,summary:string,at:Date){
    await db.query('INSERT INTO notification_events(project_id,event_key,kind,source_id,summary,occurred_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[config.project_id,key,kind,source,this.protect(summary),at]);
  }
  private async collect(db:Pick<pg.PoolClient,'query'>,config:Configuration,now:Date){
    const alerts=(await db.query<{id:string;alert_id:string;code:string;payload:{finding:{itemName:string;message:string}};last_seen:Date;created_at:Date}>(`SELECT e.id,e.alert_id,e.created_at,a.code,a.payload,a.last_seen FROM alert_events e JOIN project_alerts a ON a.id=e.alert_id WHERE e.project_id=$1 AND e.created_at>=$2 AND NOT EXISTS(SELECT 1 FROM notification_events n WHERE n.project_id=e.project_id AND n.event_key='alert:'||e.id::text) AND e.action IN ('opened','reopened') AND a.status<>'resolved' AND a.code=ANY($3::text[]) ORDER BY e.created_at LIMIT 200`,[config.project_id,config.changed_at,config.settings.events])).rows;
    for(const alert of alerts)await this.addEvent(db,config,'alert:'+alert.id,alert.code,alert.alert_id,`${names[alert.code]}: ${alert.payload.finding.itemName}. ${alert.payload.finding.message} Evidencia: ${alert.last_seen.toISOString()}.`,alert.created_at);
    if(config.settings.events.includes('report_ready')){
      const rows=(await db.query<{id:string;cutoff:Date;finished_at:Date}>("SELECT id,cutoff,finished_at FROM report_jobs WHERE project_id=$1 AND status='published' AND finished_at>=$2 AND NOT EXISTS(SELECT 1 FROM notification_events e WHERE e.project_id=report_jobs.project_id AND e.event_key='report:'||report_jobs.id::text) ORDER BY finished_at LIMIT 200",[config.project_id,config.changed_at])).rows;
      for(const row of rows)await this.addEvent(db,config,'report:'+row.id,'report_ready',row.id,'Reporte disponible en el panel. Corte: '+row.cutoff.toISOString()+'. Referencia: '+row.id,row.finished_at);
    }
    if(config.settings.events.includes('source_failure')){
      const rows=(await db.query<{id:string;error_code:string;finished_at:Date}>("SELECT id,error_code,finished_at FROM supervision_jobs WHERE project_id=$1 AND status IN ('failed','partial') AND error_code IS NOT NULL AND finished_at>=$2 AND NOT EXISTS(SELECT 1 FROM notification_events e WHERE e.project_id=supervision_jobs.project_id AND e.event_key='source:'||supervision_jobs.id::text) ORDER BY finished_at LIMIT 200",[config.project_id,config.changed_at])).rows;
      for(const row of rows)await this.addEvent(db,config,'source:'+row.id,'source_failure',row.id,'La actualizaciÃ³n de fuentes necesita atenciÃ³n. Consulta el trabajo '+row.id+' en OperaciÃ³n; se conserva la Ãºltima lectura disponible.',row.finished_at);
    }
    if(config.settings.reminderHours>0&&now.getTime()-config.changed_at.getTime()>=config.settings.reminderHours*3600000){
      const rows=(await db.query<{id:string;code:string;payload:{finding:{itemName:string}};last_seen:Date}>(`SELECT a.* FROM project_alerts a WHERE a.project_id=$1 AND a.status='open' AND a.code=ANY($2::text[]) AND EXISTS(SELECT 1 FROM notification_events previous WHERE previous.project_id=a.project_id AND previous.source_id=a.id::text AND previous.created_at>=$4) AND NOT EXISTS(SELECT 1 FROM notification_events e WHERE e.project_id=a.project_id AND e.source_id=a.id::text AND e.created_at>$3) LIMIT 100`,[config.project_id,config.settings.events,new Date(now.getTime()-config.settings.reminderHours*3600000),config.changed_at])).rows;
      for(const row of rows)await this.addEvent(db,config,'reminder:'+row.id+':'+Math.floor((now.getTime()-config.changed_at.getTime())/(config.settings.reminderHours*3600000)),row.code,row.id,`Recordatorio: ${names[row.code]} Â· ${row.payload.finding.itemName}. Ãšltima evidencia: ${row.last_seen.toISOString()}. Comprueba su vigencia en el panel.`,now);
    }
    const events=(await db.query<{id:string}>(`SELECT e.id FROM notification_events e WHERE e.project_id=$1 AND e.created_at>=$2 AND NOT EXISTS(SELECT 1 FROM notification_deliveries d WHERE d.project_id=e.project_id AND e.id=ANY(d.event_ids)) ORDER BY e.occurred_at LIMIT 50`,[config.project_id,config.changed_at])).rows;
    const queued=(await db.query<{id:string}>("SELECT id FROM notification_deliveries WHERE project_id=$1 AND configuration_version=$2 AND kind='notification' AND status='queued' AND cardinality(event_ids)<500 ORDER BY created_at LIMIT 1",[config.project_id,config.version])).rows[0];
    if(events.length&&queued){await db.query('UPDATE notification_deliveries SET event_ids=event_ids||$2::uuid[] WHERE id=$1',[queued.id,events.map(e=>e.id)]);return;}
    if(events.length)await db.query("INSERT INTO notification_deliveries(project_id,configuration_version,request_key,recipient,kind,event_ids,status,next_attempt) VALUES($1,$2,$3,$4,'notification',$5,'queued',$6)",[config.project_id,config.version,randomUUID(),config.settings.recipient,events.map(e=>e.id),deliveryTime(config.settings,now)]);
  }
  async tick(onlyProject?:string,now=new Date()){
    const configs=(await this.database.query<Configuration>('SELECT DISTINCT ON(project_id) * FROM notification_configurations WHERE ($1::uuid IS NULL OR project_id=$1) ORDER BY project_id,version DESC',[onlyProject??null])).rows;
    for(const config of configs){
      const db=await this.database.connect();let locked=false;
      try{
        locked=(await db.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['notifications:'+config.project_id])).rows[0]!.locked;if(!locked)continue;
        const current=(await db.query<{version:number}>('SELECT version FROM notification_configurations WHERE project_id=$1 ORDER BY version DESC LIMIT 1',[config.project_id])).rows[0];if(current?.version!==config.version)continue;
        await db.query("UPDATE notification_deliveries SET status='uncertain',error_code='PROCESS_INTERRUPTED',finished_at=clock_timestamp() WHERE project_id=$1 AND status='sending' AND next_attempt<clock_timestamp()-interval '5 minutes'",[config.project_id]);
        try{await assertManager(db,config.project_id,{id:config.changed_by,auth_version:config.auth_version});}catch{
          await db.query("UPDATE notification_deliveries SET status='cancelled',error_code='FORBIDDEN',finished_at=clock_timestamp() WHERE project_id=$1 AND status='queued'",[config.project_id]);continue;
        }
        if(config.settings.enabled){await db.query('BEGIN');try{await this.collect(db,config,now);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
        if(!this.transport)continue;
        const delivery=(await db.query<Delivery>("SELECT * FROM notification_deliveries WHERE project_id=$1 AND configuration_version=$2 AND status='queued' AND next_attempt<=$3 ORDER BY created_at LIMIT 1",[config.project_id,config.version,now])).rows[0];if(!delivery)continue;
        if(delivery.kind!=='test'&&!config.settings.enabled)continue;
        const allowed=deliveryTime({...config.settings,mode:'immediate'},now);if(delivery.kind!=='test'&&allowed>now){await db.query('UPDATE notification_deliveries SET next_attempt=$2 WHERE id=$1',[delivery.id,allowed]);continue;}
        const dayStart=new Date(now);dayStart.setUTCHours(5,0,0,0);if(dayStart>now)dayStart.setUTCDate(dayStart.getUTCDate()-1);
        const sent=(await db.query<{count:number}>("SELECT count(*)::int AS count FROM notification_deliveries WHERE project_id=$1 AND status IN ('accepted','sending','uncertain') AND finished_at>=$2",[config.project_id,dayStart])).rows[0]!.count;
        if(sent>=config.settings.maxPerDay){await db.query('UPDATE notification_deliveries SET next_attempt=$2 WHERE id=$1',[delivery.id,new Date(dayStart.getTime()+86400000)]);continue;}
        const events=(await db.query<{summary:string;source_id:string;kind:string}>('SELECT summary,source_id,kind FROM notification_events WHERE project_id=$1 AND id=ANY($2::uuid[]) ORDER BY occurred_at',[config.project_id,delivery.event_ids])).rows;
        const active=[];
        for(const event of events){if(names[event.kind]){const alert=(await db.query("SELECT id FROM project_alerts WHERE project_id=$1 AND id=$2 AND status<>'resolved'",[config.project_id,event.source_id])).rows[0];if(!alert)continue;}active.push(event.summary);}
        if(delivery.kind!=='test'&&!active.length){await db.query("UPDATE notification_deliveries SET status='cancelled',error_code='ALERT_RESOLVED',finished_at=clock_timestamp() WHERE id=$1",[delivery.id]);continue;}
        const project=(await db.query<{name:string}>('SELECT name FROM projects WHERE id=$1',[config.project_id])).rows[0]!;
        // Commit sending intent before SMTP. A crash must never trigger an automatic duplicate.
        await db.query("UPDATE notification_deliveries SET status='sending',attempt_count=attempt_count+1,next_attempt=$2 WHERE id=$1",[delivery.id,now]);
        try{
          await this.transport.send({to:delivery.recipient,...renderNotification(this.protect(project.name),active,this.baseUrl,delivery.kind==='test',delivery.kind==='test'?'overview':events.every(event=>event.kind==='report_ready')?'reports':events.every(event=>event.kind==='source_failure')?'operations':events.every(event=>!!names[event.kind])?'alerts':'overview'),messageId:`<${delivery.id}@dev-project-agent.local>`});
          await db.query("UPDATE notification_deliveries SET status='accepted',error_code=NULL,finished_at=clock_timestamp() WHERE id=$1",[delivery.id]);await this.audit(db,config.project_id,null,'notifications.accepted',delivery.id);
        }catch(error){const code=mailFailure(error),retry=['SMTP_TEMPORARY_FAILURE','SMTP_CONNECTION_FAILED'].includes(code)&&delivery.attempt_count<2;
          await db.query("UPDATE notification_deliveries SET status=$2,error_code=$3,next_attempt=$4,finished_at=clock_timestamp() WHERE id=$1",[delivery.id,retry?'queued':code==='SMTP_RESULT_UNCERTAIN'?'uncertain':'failed',code,new Date(now.getTime()+5*60000)]);
          await this.audit(db,config.project_id,null,'notifications.send',delivery.id,'failed');
        }
      }finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['notifications:'+config.project_id]);db.release();}
    }
  }
}
export function startNotificationWorker(service:NotificationService,onError:()=>void){let pending:Promise<void>|null=null,stopped=false;const tick=()=>{if(stopped||pending)return;pending=service.tick().catch(onError).finally(()=>{pending=null;});};const timer=setInterval(tick,15000);tick();return {close:async()=>{stopped=true;clearInterval(timer);await pending;}};}
