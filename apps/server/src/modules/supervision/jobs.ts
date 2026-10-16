import type { SupervisionJob, SupervisionJobKind, SupervisionOverview, SupervisionResult, SupervisionRun } from '@dev-project-agent/contracts';
import type { AuthDatabase, AuthUser } from '../auth/repository.js';
import type { TrelloDatabase } from '../../integrations/trello/service.js';
import { assertManager, SupervisionError } from './access.js';
import {persistAlerts} from '../operations/alerts.js';
interface JobRow {
  id:string;project_id:string;requested_by:string;requested_auth_version:number;request_key:string;kind:SupervisionJobKind;status:SupervisionJob['status'];
  created_at:Date;started_at:Date|null;finished_at:Date|null;attempt:number;error_code:string|null;run_id:string|null;lease_token:string;lease_expires_at:Date;
}
export type ClaimedJob=JobRow;
const jobSelect='SELECT j.*,r.id AS run_id FROM supervision_jobs j LEFT JOIN supervision_runs r ON r.job_id=j.id';
export const jobView=(row:JobRow):SupervisionJob=>({id:row.id,kind:row.kind,status:row.status,createdAt:row.created_at.toISOString(),startedAt:row.started_at?.toISOString()??null,
  finishedAt:row.finished_at?.toISOString()??null,attempt:row.attempt,errorCode:row.error_code,runId:row.run_id??null});
export async function getJob(database:AuthDatabase,projectId:string,id:string) {
  const row=(await database.query<JobRow>(jobSelect+' WHERE j.project_id=$1 AND j.id=$2',[projectId,id])).rows[0];
  if(!row) return null;
  const events=await database.query<{stage:string;outcome:string;error_code:string|null;created_at:Date}>('SELECT stage,outcome,error_code,created_at FROM supervision_job_events WHERE project_id=$1 AND job_id=$2 ORDER BY created_at,id',[projectId,id]);
  return {job:jobView(row),events:events.rows.map(event=>({stage:event.stage,outcome:event.outcome,errorCode:event.error_code,createdAt:event.created_at.toISOString()}))};
}
export async function enqueueJob(database:TrelloDatabase,projectId:string,actor:AuthUser,kind:SupervisionJobKind,requestKey:string) {
  const client=await database.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`supervision-enqueue:${projectId}`]);
    await assertManager(client,projectId,actor);
    const duplicate=(await client.query<JobRow>(jobSelect+' WHERE j.project_id=$1 AND j.requested_by=$2 AND j.request_key=$3',[projectId,actor.id,requestKey])).rows[0];
    if(duplicate) { if(duplicate.kind!==kind) throw new SupervisionError('CONFLICT'); await client.query('COMMIT'); return jobView(duplicate); }
    if((await client.query("SELECT id FROM supervision_jobs WHERE project_id=$1 AND status IN ('queued','running')",[projectId])).rows.length) throw new SupervisionError('CONFLICT');
    const row=(await client.query<JobRow>('INSERT INTO supervision_jobs (project_id,requested_by,requested_auth_version,request_key,kind) VALUES ($1,$2,$3,$4,$5) RETURNING *',[projectId,actor.id,actor.auth_version,requestKey,kind])).rows[0]!;
    await client.query('INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',[projectId,'user',actor.id,'supervision.request','supervision_job',row.id,'succeeded']);
    await client.query('COMMIT'); return jobView(row);
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
}
export async function claimJob(database:AuthDatabase,projectId?:string):Promise<ClaimedJob|null> {
  const row=(await database.query<JobRow>(`WITH candidate AS (
    SELECT id FROM supervision_jobs WHERE ($1::uuid IS NULL OR project_id=$1) AND attempt<3 AND (status='queued' OR (status='running' AND lease_expires_at<clock_timestamp()))
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE supervision_jobs j SET status='running',started_at=COALESCE(j.started_at,clock_timestamp()),attempt=j.attempt+1,
    lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '120 seconds',error_code=NULL
    FROM candidate c WHERE j.id=c.id RETURNING j.*`,[projectId??null])).rows[0];
  return row??null;
}
export async function heartbeat(database:AuthDatabase,job:ClaimedJob) {
  const response=await database.query("UPDATE supervision_jobs SET lease_expires_at=clock_timestamp()+interval '120 seconds' WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>clock_timestamp()",[job.id,job.lease_token]);
  if(!response.rowCount) throw new SupervisionError('LEASE_LOST');
}
export async function jobEvent(database:AuthDatabase,job:ClaimedJob,stage:string,outcome:'started'|'succeeded'|'failed'|'recovered',code:string|null=null) {
  const inserted=await database.query("INSERT INTO supervision_job_events (project_id,job_id,stage,outcome,error_code) SELECT project_id,id,$3,$4,$5 FROM supervision_jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>clock_timestamp()",[job.id,job.lease_token,stage,outcome,code]);
  if(!inserted.rowCount) throw new SupervisionError('LEASE_LOST');
}
export async function finishJob(database:TrelloDatabase,job:ClaimedJob,status:'succeeded'|'partial'|'failed',errorCode:string|null,result?:SupervisionResult,policyVersion?:number) {
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    const current=await client.query("SELECT id FROM supervision_jobs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>clock_timestamp() FOR UPDATE",[job.id,job.lease_token]);
    if(!current.rows.length) throw new SupervisionError('LEASE_LOST');
    if(result) {
      const saved=(await client.query<{id:string}>('INSERT INTO supervision_runs (project_id,job_id,status,trello_snapshot_id,github_snapshot_id,policy_version,baseline_version,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [job.project_id,job.id,status==='succeeded'?'complete':'partial',result.trelloSnapshotId,result.githubSnapshotId,policyVersion,result.baselineVersion,JSON.stringify(result)])).rows[0]!;
      await persistAlerts(client,job.project_id,saved.id,result,policyVersion);
    }
    await client.query('UPDATE supervision_jobs SET status=$2,finished_at=clock_timestamp(),error_code=$3,lease_token=NULL,lease_expires_at=NULL WHERE id=$1',[job.id,status,errorCode]);
    await client.query('INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',[job.project_id,'system',null,'supervision.finish','supervision_job',job.id,status==='failed'?'failed':'succeeded']);
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally{client.release();}
}
export async function expireExhaustedJobs(database:TrelloDatabase,projectId?:string) {
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    const rows=(await client.query<{id:string;project_id:string}>("UPDATE supervision_jobs SET status='failed',finished_at=clock_timestamp(),error_code='RECOVERY_EXHAUSTED',lease_token=NULL,lease_expires_at=NULL WHERE ($1::uuid IS NULL OR project_id=$1) AND status='running' AND lease_expires_at<clock_timestamp() AND attempt>=3 RETURNING id,project_id",[projectId??null])).rows;
    for(const row of rows) {
      await client.query('INSERT INTO supervision_job_events (project_id,job_id,stage,outcome,error_code) VALUES ($1,$2,$3,$4,$5)',[row.project_id,row.id,'recovery','failed','RECOVERY_EXHAUSTED']);
      await client.query('INSERT INTO audit_events (project_id,actor_type,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,$5,$6)',[row.project_id,'system','supervision.finish','supervision_job',row.id,'failed']);
    }
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally{client.release();}
}
export async function getRun(database:AuthDatabase,projectId:string,id?:string):Promise<SupervisionRun|null> {
  const row=(await database.query<{id:string;job_id:string;created_at:Date;status:'complete'|'partial';result:SupervisionResult}>(
    'SELECT id,job_id,created_at,status,result FROM supervision_runs WHERE project_id=$1'+(id?' AND id=$2':'')+' ORDER BY created_at DESC,id DESC LIMIT 1',id?[projectId,id]:[projectId])).rows[0];
  return row?{id:row.id,jobId:row.job_id,createdAt:row.created_at.toISOString(),status:row.status,result:row.result}:null;
}
export async function supervisionOverview(database:AuthDatabase,projectId:string):Promise<SupervisionOverview> {
  const jobs=(await database.query<JobRow>(jobSelect+' WHERE j.project_id=$1 ORDER BY j.created_at DESC,j.id DESC LIMIT 20',[projectId])).rows.map(jobView);
  const rows=(await database.query<{id:string;job_id:string;created_at:Date;status:'complete'|'partial'}>('SELECT id,job_id,created_at,status FROM supervision_runs WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[projectId])).rows;
  return {jobs,runs:rows.map(row=>({id:row.id,jobId:row.job_id,createdAt:row.created_at.toISOString(),status:row.status})),latestRun:await getRun(database,projectId)};
}
