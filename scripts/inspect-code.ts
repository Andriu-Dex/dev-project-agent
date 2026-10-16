import pg from 'pg';
import {githubToken,type GitHubConnection} from '../apps/server/src/integrations/github/client.js';
import {readCodeCatalog,readCodeSource} from '../apps/server/src/integrations/github/code-client.js';
import {deterministicAnalysis} from '../apps/server/src/modules/code-review/evidence.js';

const pool=new pg.Pool({connectionString:process.env.APP_DATABASE_URL,max:1});
try {
  const connection=(await pool.query<GitHubConnection>('SELECT owner,repository,branch FROM github_connections ORDER BY project_id LIMIT 1')).rows[0];
  if(!connection)throw new Error('GitHub connection is not configured.');
  const token=githubToken(process.env),catalog=await readCodeCatalog(connection,token),paths=process.argv.slice(2);
  if(!paths.length)console.log(JSON.stringify({connection,head:catalog.head,eligibleFiles:catalog.files.map(file=>({path:file.path,size:file.size})),limits:catalog.limits},null,2));
  else {
    const source=await readCodeSource(connection,{paths,expectedHead:catalog.head,mode:'files',baseSha:null},token),result=deterministicAnalysis(source);
    console.log(JSON.stringify({connection,head:source.head,files:source.files.map(file=>({path:file.path,blobSha:file.blobSha,size:file.size})),checks:result.checks,findingCount:result.findings.length,limitations:result.limitations},null,2));
  }
}catch(error){console.error(error&&typeof error==='object'&&'code' in error?String(error.code):'Code inspection failed.');process.exitCode=1;}
finally{await pool.end();}
