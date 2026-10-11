import type { TrelloDatabase } from '../../integrations/trello/service.js';
import { overview, synchronize } from '../../integrations/trello/service.js';
import { readBoard, type TrelloCredentials } from '../../integrations/trello/client.js';
import { TrelloError } from '../../integrations/trello/normalize.js';
import { githubOverview, synchronizeGitHub } from '../../integrations/github/service.js';
import { GitHubError } from '../../integrations/github/client.js';
import { readTrackingPolicy } from '../tracking/policy.js';
import { latestBaseline } from './baseline.js';
import { analyzeSources } from './analyze.js';
import { assertManager, SupervisionError } from './access.js';
import { claimJob, expireExhaustedJobs, finishJob, heartbeat, jobEvent, type ClaimedJob } from './jobs.js';
export interface SupervisionOptions { database:TrelloDatabase; trelloCredentials:TrelloCredentials|null; githubToken:string|null; fetcher?:typeof fetch }
const safeCode=(error:unknown)=>error instanceof GitHubError||error instanceof TrelloError||error instanceof SupervisionError?error.code:'STORAGE_UNAVAILABLE';

export async function executeJob(options:SupervisionOptions,job:ClaimedJob) {
  const {database}=options; const actor={id:job.requested_by,auth_version:job.requested_auth_version};
  let leaseLost=false,beating=false;
  const timer=setInterval(()=>{if(beating)return;beating=true;void heartbeat(database,job).catch(()=>{leaseLost=true;}).finally(()=>{beating=false;});},20_000);
  const valid=async()=>{if(leaseLost)throw new SupervisionError('LEASE_LOST');await heartbeat(database,job);await assertManager(database,job.project_id,actor);};
  try {
    await valid(); await jobEvent(database,job,'supervision',job.attempt>1?'recovered':'started');
    const failures:string[]=[];
    async function stage(name:string,operation:()=>Promise<unknown>) {
      await valid();await jobEvent(database,job,name,'started');
      try{await operation();await valid();await jobEvent(database,job,name,'succeeded');}
      catch(error){const code=safeCode(error);if(code==='LEASE_LOST'||code==='FORBIDDEN')throw error;failures.push(code);await jobEvent(database,job,name,'failed',code);}
    }
    if(job.kind==='full'||job.kind==='trello_sync') await stage('trello',()=>synchronize(database,job.project_id,actor.id,'api',async boardId=>{
      if(!options.trelloCredentials)throw new TrelloError('CREDENTIALS_REQUIRED');
      return {board:await readBoard(boardId,options.trelloCredentials,options.fetcher),observedAt:new Date()};
    }));
    if(job.kind==='full'||job.kind==='github_sync') await stage('github',()=>synchronizeGitHub(database,job.project_id,actor.id,options.githubToken,options.fetcher));
    if(job.kind==='analysis'||job.kind==='full') {
      await valid();await jobEvent(database,job,'analysis','started');
      const client=await database.connect();
      let sources;
      try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const trello=await overview(client,job.project_id,Boolean(options.trelloCredentials));
        const github=await githubOverview(client,job.project_id);
        const policy=await readTrackingPolicy(client,job.project_id);
        const baseline=await latestBaseline(client,job.project_id);
        sources={trello,github,policy,baseline};await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      if(!sources.policy)throw new SupervisionError('POLICY_NOT_CONFIGURED');
      if(!sources.trello?.latest&&!sources.github.latest)throw new SupervisionError('NO_DATA');
      const result=analyzeSources(sources.trello,sources.github,sources.policy,sources.baseline,new Date());
      if(failures.length)result.limitations.push('Esta supervisión conserva datos anteriores de las fuentes cuya sincronización falló. Consulta el historial de etapas.');
      const partial=failures.length>0||!result.trelloSnapshotId||!result.githubSnapshotId;
      await valid();await jobEvent(database,job,'analysis','succeeded');
      await finishJob(database,job,partial?'partial':'succeeded',failures[0]??null,result,sources.policy.version);
    }else{await valid();await finishJob(database,job,failures.length?'failed':'succeeded',failures[0]??null);}
  }catch(error){
    if(safeCode(error)!=='LEASE_LOST'){
      try{await jobEvent(database,job,'supervision','failed',safeCode(error));await finishJob(database,job,'failed',safeCode(error));}catch{/* An expired lease is recovered by another worker. */}
    }
  }finally{clearInterval(timer);}
}
export async function processNextJob(options:SupervisionOptions) {
  await expireExhaustedJobs(options.database);
  const job=await claimJob(options.database);if(!job)return false;
  await executeJob(options,job);return true;
}
export function startSupervisionWorker(options:SupervisionOptions,onError:()=>void) {
  let stopped=false;let pending:Promise<void>|null=null;
  function tick(){if(stopped||pending)return;pending=processNextJob(options).then(()=>{}).catch(onError).finally(()=>{pending=null;});}
  const timer=setInterval(tick,2000);tick();
  return {close:async()=>{stopped=true;clearInterval(timer);await pending;}};
}
