import pg from 'pg';
import {credentialsFromEnvironment,readBoard} from '../apps/server/src/integrations/trello/client.js';
import {overview,synchronize} from '../apps/server/src/integrations/trello/service.js';
import {githubToken,GitHubError} from '../apps/server/src/integrations/github/client.js';
import {githubOverview,synchronizeGitHub} from '../apps/server/src/integrations/github/service.js';
import {TrelloError} from '../apps/server/src/integrations/trello/normalize.js';
import {readTrackingPolicy} from '../apps/server/src/modules/tracking/policy.js';
import {latestBaseline} from '../apps/server/src/modules/supervision/baseline.js';
import {analyzeSources} from '../apps/server/src/modules/supervision/analyze.js';
if(!process.env.APP_DATABASE_URL)throw new Error('APP_DATABASE_URL is required.');
const database=new pg.Pool({connectionString:process.env.APP_DATABASE_URL,max:4,connectionTimeoutMillis:3000,statement_timeout:3000});
try{
  const project=(await database.query<{id:string}>("SELECT id FROM projects WHERE name='UTAPED' ORDER BY created_at,id LIMIT 1")).rows[0];
  if(!project)throw new Error('The configured project is not available.');
  const credentials=credentialsFromEnvironment(process.env);
  const results=await Promise.allSettled([
    synchronize(database,project.id,null,'api',async boardId=>{if(!credentials)throw new TrelloError('CREDENTIALS_REQUIRED');return {board:await readBoard(boardId,credentials),observedAt:new Date()};}),
    synchronizeGitHub(database,project.id,null,githubToken(process.env)),
  ]);
  for(const [index,result] of results.entries()){
    const source=index===0?'Trello':'GitHub';
    if(result.status==='fulfilled')console.log(`${source}: snapshot persisted.`);
    else{console.error(`${source}: ${result.reason instanceof TrelloError||result.reason instanceof GitHubError?result.reason.code:'SOURCE_READ_FAILED'}. Previous data retained.`);process.exitCode=1;}
  }
  const policy=await readTrackingPolicy(database,project.id);
  if(!policy)throw new Error('Tracking policy is not configured.');
  const trello=await overview(database,project.id,Boolean(credentials)),github=await githubOverview(database,project.id),baseline=await latestBaseline(database,project.id);
  const result=analyzeSources(trello,github,policy,baseline,new Date());
  console.log(JSON.stringify({activities:result.tracking?.summary?.activities.total??null,milestones:result.tracking?.summary?.milestones.total??null,
    dependencyObservations:result.dependencies.length,baselineVersion:result.baselineVersion,githubHead:result.code?.head??null,commits:result.code?.commits.length??0,files:result.code?.files.length??0}));
}catch{console.error('Source verification could not complete. Credentials were not printed.');process.exitCode=1;}
finally{await database.end();}
