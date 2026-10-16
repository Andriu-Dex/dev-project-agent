import {mkdir,open,readFile,writeFile,chmod} from 'node:fs/promises';
import {createHash,createDecipheriv} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify,parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import pg from 'pg';

const execute=promisify(execFile);
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const source=new URL(process.env.DATABASE_URL),database=source.pathname.slice(1),user=decodeURIComponent(source.username);
if(!/^[a-zA-Z0-9_]+$/.test(database)||!/^[a-zA-Z0-9_]+$/.test(user))throw new Error('Unsupported local database identifier.');
const container=(await execute('docker',['compose','ps','-q','postgres'],{windowsHide:true})).stdout.trim();
if(!/^[a-f0-9]{12,64}$/.test(container))throw new Error('Start the project PostgreSQL container first.');
const directory=path.resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(directory,{recursive:true,mode:0o700});
if(process.platform==='win32')await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./protect-path.ps1',import.meta.url)),'-Path',directory],{windowsHide:true,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath'))});
else await chmod(directory,0o700);
const archive=path.join(directory,'database.dump'),config=path.join(directory,'recovery.env');
const output=await open(archive,'wx',0o600);
async function processFile(command,args,streams){
  await new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:streams,windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Database backup/restore command failed.')));});
}
try{await processFile('docker',['exec',container,'pg_dump','-U',user,'-d',database,'--format=custom','--no-owner'],['ignore',output.fd,'ignore']);}finally{await output.close();}
await writeFile(config,await readFile('.env'),{flag:'wx',mode:0o600});
const sha256=createHash('sha256').update(await readFile(archive)).digest('hex');
const verification={createdAt:new Date().toISOString(),database,sha256,verified:false,tables:[],note:'Private backup includes database state and recovery credentials. Never distribute or commit this directory.'};
if(process.argv.includes('--verify')){
  const restoreName='dpa_restore_'+Date.now(),admin=new pg.Client({connectionString:source.href});await admin.connect();
  const restoredUrl=new URL(source);restoredUrl.pathname='/'+restoreName;let restored;
  try{
    await admin.query(`CREATE DATABASE "${restoreName}"`);
    const input=await open(archive,'r');try{await processFile('docker',['exec','-i',container,'pg_restore','-U',user,'-d',restoreName,'--exit-on-error','--no-owner'],[input.fd,'ignore','ignore']);}finally{await input.close();}
    restored=new pg.Client({connectionString:restoredUrl.href});await restored.connect();
    const tables=(await restored.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename);
    for(const table of tables){if(!/^[a-z_0-9]+$/.test(table))throw new Error('Unsupported backup table identifier.');const count=(await restored.query(`SELECT count(*)::text AS count FROM "${table}"`)).rows[0].count;verification.tables.push({table,rows:Number(count)});}
    await restored.query('SELECT 1 FROM schema_migrations LIMIT 1');
    const runtimeUrl=new URL(process.env.APP_DATABASE_URL);runtimeUrl.pathname='/'+restoreName;
    const runtime=new pg.Client({connectionString:runtimeUrl.href});await runtime.connect();
    try{
      await runtime.query('SELECT id FROM projects LIMIT 1');
      const protectedHistory=(await runtime.query("SELECT has_table_privilege(current_user,'code_decisions','SELECT') AS read,has_table_privilege(current_user,'code_decisions','UPDATE') AS update")).rows[0];
      if(!protectedHistory.read||protectedHistory.update)throw new Error('Restored runtime history permissions are incorrect.');
    }finally{await runtime.end();}
    // The encryption key must survive the private configuration backup exactly.
    const restoredConfig=parseEnv(await readFile(config,'utf8'));
    if(process.env.CHATGPT_CREDENTIAL_KEY&&restoredConfig.CHATGPT_CREDENTIAL_KEY!==process.env.CHATGPT_CREDENTIAL_KEY)throw new Error('Recovery encryption key was not preserved.');
    const grants=(await restored.query('SELECT project_id,user_id,auth_version,ciphertext FROM chatgpt_credentials WHERE ciphertext IS NOT NULL')).rows;
    for(const grant of grants){
      const [version,iv,tag,data]=grant.ciphertext.split('.');if(version!=='v1')throw new Error('Unsupported credential envelope.');
      const decipher=createDecipheriv('aes-256-gcm',Buffer.from(restoredConfig.CHATGPT_CREDENTIAL_KEY,'hex'),Buffer.from(iv,'base64url'));
      decipher.setAAD(Buffer.from(JSON.stringify([grant.project_id,grant.user_id,grant.auth_version])));decipher.setAuthTag(Buffer.from(tag,'base64url'));
      const tokens=JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));
      if(!tokens.accessToken||!tokens.refreshToken)throw new Error('Restored credential envelope is invalid.');
    }
    verification.credentialEnvelopesVerified=grants.length;
    verification.verified=true;
  }finally{await restored?.end();await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[restoreName]);await admin.query(`DROP DATABASE IF EXISTS "${restoreName}"`);await admin.end();}
}
await writeFile(path.join(directory,'manifest.json'),JSON.stringify(verification,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({directory,sha256,restoreVerified:verification.verified,tableCount:verification.tables.length}));
