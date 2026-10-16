import pg from 'pg';
import {runner} from 'node-pg-migrate';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const name='dpa_verify_'+Date.now();
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
const appUrl=new URL(process.env.APP_DATABASE_URL??process.env.DATABASE_URL);appUrl.pathname='/'+name;
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  await runner({databaseUrl:url.href,dir:'migrations',direction:'up',migrationsTable:'schema_migrations',count:Infinity,verbose:false,log:()=>{}});
  const onlyCoverage=process.argv.includes('--coverage');
  const env={...process.env,DATABASE_URL:url.href,APP_DATABASE_URL:appUrl.href,
    TRELLO_TOKEN:'',TRELLO_API_KEY:'',TRELLO_WRITE_TOKEN:'',GITHUB_TOKEN:'',GITHUB_WRITE_TOKEN:'',
    TRELLO_WRITES_ENABLED:'false',GITHUB_WRITES_ENABLED:'false',SMTP_HOST:'',SMTP_PASS:'',
    RUN_COVERAGE_DB_TESTS:'true',
  };
  if(!onlyCoverage)for(const flag of ['AUTH','TRELLO','SUPERVISION','PROVIDER','PROPOSALS','EXECUTIONS','CODE','RENEWAL','REPORTS','OPERATIONS','NOTIFICATIONS'])env[`RUN_${flag}_DB_TESTS`]='true';
  const args=['node_modules/vitest/vitest.mjs','run',...(onlyCoverage?['apps/server/src/modules/code-review/coverage.integration.test.ts']:[]),'--fileParallelism=false'];
  const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env});child.on('error',reject);child.on('exit',code=>resolve(code??1));});
  await mkdir('work/release-validation',{recursive:true});
  await writeFile('work/release-validation/isolated-tests.json',JSON.stringify({database:name,onlyCoverage,exitCode,finishedAt:new Date().toISOString(),externalCredentialsRemoved:true},null,2));
  process.exitCode=Number(exitCode);
} finally {
  // This database contains synthetic fixtures only; the live database is never targeted.
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
