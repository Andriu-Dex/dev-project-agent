import type { GitHubOverview, GitHubSnapshot } from '@dev-project-agent/contracts';
import type { AuthDatabase } from '../../modules/auth/repository.js';
import type { TrelloDatabase } from '../trello/service.js';
import { GitHubError, type GitHubConnection, readRepository } from './client.js';

export async function githubOverview(database: AuthDatabase, projectId: string): Promise<GitHubOverview> {
  const connections=await database.query<{owner:string;repository:string;branch:string}>('SELECT owner, repository, branch FROM github_connections WHERE project_id=$1',[projectId]);
  const snapshots=await database.query<{id:string;observed_at:Date;data:GitHubSnapshot}>('SELECT id, observed_at, data FROM github_snapshots WHERE project_id=$1 ORDER BY observed_at DESC,id DESC LIMIT 1',[projectId]);
  const attempts=await database.query<{status:'succeeded'|'failed';attempted_at:Date;error_code:string|null}>('SELECT status, attempted_at, error_code FROM github_sync_attempts WHERE project_id=$1 ORDER BY attempted_at DESC,id DESC LIMIT 1',[projectId]);
  const row=snapshots.rows[0],attempt=attempts.rows[0];
  return {connection:connections.rows[0]??null,latest:row?{id:row.id,observedAt:row.observed_at.toISOString(),data:row.data}:null,
    lastAttempt:attempt?{status:attempt.status,attemptedAt:attempt.attempted_at.toISOString(),errorCode:attempt.error_code}:null};
}
export async function synchronizeGitHub(database:TrelloDatabase,projectId:string,actorId:string|null,token:string|null,fetcher:typeof fetch=fetch) {
  const client=await database.connect(); let locked=false; let transaction=false;
  try {
    locked=(await client.query<{acquired:boolean}>('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[`github:${projectId}`])).rows[0]?.acquired??false;
    if (!locked) throw new GitHubError('SYNC_BUSY');
    const state=await githubOverview(client,projectId);
    if (!state.connection) throw new GitHubError('NOT_CONFIGURED');
    const data=await readRepository(state.connection as GitHubConnection,state.latest?.data.head??null,token,fetcher);
    await client.query('BEGIN'); transaction=true;
    const row=(await client.query<{id:string}>('INSERT INTO github_snapshots (project_id,data) VALUES ($1,$2) RETURNING id',[projectId,JSON.stringify(data)])).rows[0]!;
    await client.query("INSERT INTO github_sync_attempts (project_id,status) VALUES ($1,'succeeded')",[projectId]);
    await client.query('INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',[projectId,actorId?'user':'system',actorId,'github.sync','github_snapshot',row.id,'succeeded']);
    await client.query('COMMIT'); transaction=false; return {snapshotId:row.id};
  } catch (error) {
    if (transaction) await client.query('ROLLBACK');
    const safe=error instanceof GitHubError ? error : new GitHubError('STORAGE_UNAVAILABLE');
    if (locked && (await client.query('SELECT project_id FROM github_connections WHERE project_id=$1',[projectId])).rows.length) {
      await client.query('BEGIN');
      try { await client.query("INSERT INTO github_sync_attempts (project_id,status,error_code) VALUES ($1,'failed',$2)",[projectId,safe.code]);
        await client.query('INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',[projectId,actorId?'user':'system',actorId,'github.sync','github_snapshot',safe.code,'failed']);
        await client.query('COMMIT'); } catch { await client.query('ROLLBACK'); }
    }
    throw safe;
  } finally {
    let discard=false;
    try { if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',[`github:${projectId}`]); }
    catch(error){discard=true;throw error;}
    finally{client.release(discard);}
  }
}
