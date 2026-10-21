import pg from 'pg';
import {runner} from 'node-pg-migrate';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';

if(!process.env.DATABASE_URL||!process.env.APP_DATABASE_URL)throw new Error('Migration and runtime database URLs are required.');
const name='dpa_upgrade_'+Date.now(),admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const ownerUrl=new URL(process.env.DATABASE_URL),runtimeUrl=new URL(process.env.APP_DATABASE_URL);ownerUrl.pathname='/'+name;runtimeUrl.pathname='/'+name;
await admin.connect();let owner,runtime;
try{
  await admin.query(`CREATE DATABASE "${name}"`);
  const initial=(await readdir('migrations')).filter(file=>/^\d.*\.cjs$/.test(file)&&file<'1792494000000').length;
  const migrate=options=>runner({databaseUrl:ownerUrl.href,dir:'migrations',direction:'up',migrationsTable:'schema_migrations',verbose:false,log:()=>{},...options});
  await migrate({count:initial});owner=new pg.Client({connectionString:ownerUrl.href});await owner.connect();
  const project=(await owner.query("INSERT INTO projects(name) VALUES('Upgrade fixture') RETURNING id")).rows[0];
  const user=(await owner.query("INSERT INTO users(login,display_name,password_hash) VALUES($1,'Upgrade manager','unusable') RETURNING id",['upgrade-'+randomUUID()])).rows[0];
  await owner.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'manager')",[project.id,user.id]);
  const job=(await owner.query("INSERT INTO report_jobs(project_id,kind,cutoff,period_start,requested_by,auth_version,request_key,request_hash,version,status) VALUES($1,'manual',clock_timestamp(),clock_timestamp()-interval '7 days',$2,1,$3,'upgrade-fixture',1,'published') RETURNING id",[project.id,user.id,randomUUID()])).rows[0];
  const historical={schemaVersion:1,executiveSummary:'Historical report fixture; preserve verbatim.',limitations:['Original limitations']},hash=createHash('sha256').update(JSON.stringify(historical)).digest('hex');
  await owner.query('INSERT INTO report_results(project_id,report_id,content_hash,data) VALUES($1,$2,$3,$4)',[project.id,job.id,hash,JSON.stringify(historical)]);
  const mail={enabled:false,recipient:'manager@example.com',events:['report_ready'],mode:'digest',digestTime:'18:00',reminderHours:24,quietEnabled:true,quietStart:'21:00',quietEnd:'08:00',maxPerDay:20};
  await owner.query('INSERT INTO notification_configurations(project_id,version,settings,changed_by,auth_version) VALUES($1,1,$2,$3,1)',[project.id,JSON.stringify(mail),user.id]);
  await migrate({count:Infinity});
  const preserved=(await owner.query('SELECT data,content_hash,rendered_html FROM report_results WHERE report_id=$1',[job.id])).rows[0];
  if(JSON.stringify(preserved.data)!==JSON.stringify((await owner.query('SELECT $1::jsonb AS data',[JSON.stringify(historical)])).rows[0].data)||preserved.content_hash!==hash||preserved.rendered_html!==null)throw new Error('Historical report changed.');
  const settings=(await owner.query('SELECT settings FROM notification_configurations WHERE project_id=$1',[project.id])).rows[0].settings;
  if(settings.enabled!==false||settings.recipient!==mail.recipient||settings.audience!==undefined||settings.contacts!==undefined)throw new Error('Notification settings changed.');
  runtime=new pg.Client({connectionString:runtimeUrl.href});await runtime.connect();
  const permission=(await runtime.query("SELECT has_table_privilege(current_user,'assistant_messages','INSERT') AS chat,has_column_privilege(current_user,'report_results','data','UPDATE') AS rewrite_report,has_column_privilege(current_user,'github_recovery_requests','plan','UPDATE') AS rewrite_plan")).rows[0];
  if(!permission.chat||permission.rewrite_report||permission.rewrite_plan)throw new Error('Runtime permissions are incorrect.');
  await mkdir('work/v11',{recursive:true});await writeFile('work/v11/upgrade-verification.json',JSON.stringify({passed:true,checkedAt:new Date().toISOString(),initialMigrations:initial,historicalReportPreserved:true,notificationDefaultsPreserved:true,immutableContentPermissions:true},null,2));
  console.log('Upgrade from the 1.0 schema passed: historical content, saved notifications and runtime permissions preserved.');
}finally{
  await runtime?.end();await owner?.end();
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);
  await admin.query(`DROP DATABASE "${name}"`);await admin.end();
}
