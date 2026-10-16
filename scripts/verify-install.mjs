import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import pg from 'pg';
import {runner} from 'node-pg-migrate';

const root=path.resolve(process.argv[2]??'.');
if(!process.env.DATABASE_URL||!process.env.APP_DATABASE_URL)throw new Error('Local migration and application database URLs are required.');
const name='dpa_install_'+Date.now(),ownerUrl=new URL(process.env.DATABASE_URL),appUrl=new URL(process.env.APP_DATABASE_URL);
const admin=new pg.Client({connectionString:ownerUrl.href});ownerUrl.pathname='/'+name;appUrl.pathname='/'+name;
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
await admin.connect();let child,owner;
const checks=[];
try{
  await admin.query(`CREATE DATABASE "${name}"`);
  await runner({databaseUrl:ownerUrl.href,dir:path.join(root,'migrations'),direction:'up',migrationsTable:'schema_migrations',count:Infinity,verbose:false,log:()=>{}});
  owner=new pg.Client({connectionString:ownerUrl.href});await owner.connect();
  const {hashPassword}=await import(pathToFileURL(path.join(root,'apps/server/dist/modules/auth/password.js')).href);
  const login='install-'+randomUUID(),password=randomBytes(24).toString('hex');
  const projectId=(await owner.query("INSERT INTO projects(name) VALUES('Isolated installation verification') RETURNING id")).rows[0].id;
  const userId=(await owner.query("INSERT INTO users(login,display_name,password_hash) VALUES($1,'Installation manager',$2) RETURNING id",[login,await hashPassword(password)])).rows[0].id;
  await owner.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'manager')",[projectId,userId]);
  const origin=`http://127.0.0.1:${port}`;
  const env={...process.env,PORT:String(port),APP_ORIGINS:origin,APP_PUBLIC_URL:origin,ALLOW_INSECURE_LOCAL_HTTP:'true',DATABASE_URL:ownerUrl.href,APP_DATABASE_URL:appUrl.href,SESSION_SECRET:randomBytes(48).toString('hex'),CHATGPT_CREDENTIAL_KEY:randomBytes(32).toString('hex')};
  for(const key of Object.keys(env))if(/(?:TOKEN|API_KEY|SMTP_|GEMINI|GROQ|GROK)/i.test(key))delete env[key];
  env.TRELLO_WRITES_ENABLED='false';env.GITHUB_WRITES_ENABLED='false';env.OLLAMA_BASE_URL='http://127.0.0.1:1';
  child=spawn(process.execPath,['apps/server/dist/index.js'],{cwd:root,env,stdio:['ignore','ignore','ignore'],windowsHide:true});
  let started=false;
  for(let attempt=0;attempt<100;attempt++){
    try{const response=await fetch(origin+'/api/v1/health');if(response.ok){started=true;break;}}catch{}
    if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!started)throw new Error('Compiled installation did not start.');checks.push('compiled_health');
  const html=await fetch(origin);if(!html.ok||!(await html.text()).includes('root'))throw new Error('Dashboard is not served.');checks.push('compiled_dashboard');
  if((await fetch(origin+`/api/v1/projects/${projectId}/code-review/coverage`)).status!==401)throw new Error('Anonymous access was not denied.');checks.push('anonymous_denied');
  const anonymous=await fetch(origin+'/api/v1/session'),session=await anonymous.json(),cookie=anonymous.headers.getSetCookie().find(value=>value.startsWith('dpa_session='))?.split(';')[0];
  const authenticated=await fetch(origin+'/api/v1/session/login',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':session.csrfToken,cookie},body:JSON.stringify({login,password})});
  const signedIn=await authenticated.json();if(!authenticated.ok||!signedIn.authenticated)throw new Error('Synthetic manager sign-in failed.');checks.push('manager_login');
  const managerCookie=authenticated.headers.getSetCookie().reverse().find(value=>value.startsWith('dpa_session='))?.split(';')[0];
  const coverage=await fetch(origin+`/api/v1/projects/${projectId}/code-review/coverage`,{headers:{cookie:managerCookie}}),body=await coverage.json();
  if(!coverage.ok||body.enabled||body.head!==null)throw new Error('Fresh coverage defaults are incorrect.');checks.push('coverage_disabled_by_default');
  const notifications=await owner.query('SELECT count(*)::int AS count FROM notification_deliveries');
  if(notifications.rows[0].count!==0)throw new Error('A fresh installation unexpectedly queued mail.');checks.push('no_external_delivery');
  await mkdir('work/release-validation',{recursive:true});
  await writeFile('work/release-validation/clean-install.json',JSON.stringify({root,checkedAt:new Date().toISOString(),isolatedDatabase:name,checks,passed:true,externalCredentialsRemoved:true},null,2));
  console.log(JSON.stringify({passed:true,checks,isolatedDatabase:name}));
}finally{
  if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(child.exitCode===null)child.kill('SIGKILL');}
  await owner?.end();await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await admin.query(`DROP DATABASE IF EXISTS "${name}"`);await admin.end();
}
