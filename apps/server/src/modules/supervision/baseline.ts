import type { BaselineVersion, TrelloSnapshot } from '@dev-project-agent/contracts';
import type { AuthDatabase, AuthUser } from '../auth/repository.js';
import type { TrelloDatabase } from '../../integrations/trello/service.js';
import { assertManager, SupervisionError } from './access.js';

export async function latestBaseline(database:AuthDatabase,projectId:string):Promise<(BaselineVersion & {data:TrelloSnapshot})|null> {
  const result=await database.query<{version:number;snapshot_id:string;confirmed_at:Date;confirmed_by:string;display_name:string;data:TrelloSnapshot}>(
    'SELECT b.version,b.snapshot_id,b.confirmed_at,b.confirmed_by,u.display_name,s.data FROM baseline_versions b JOIN users u ON u.id=b.confirmed_by JOIN trello_snapshots s ON s.project_id=b.project_id AND s.id=b.snapshot_id WHERE b.project_id=$1 ORDER BY b.version DESC LIMIT 1',[projectId]);
  const row=result.rows[0]; return row?{version:row.version,snapshotId:row.snapshot_id,confirmedAt:row.confirmed_at.toISOString(),confirmedBy:{id:row.confirmed_by,displayName:row.display_name},data:row.data}:null;
}
export async function confirmBaseline(database:TrelloDatabase,projectId:string,actor:AuthUser,expectedVersion:number,snapshotId:string) {
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`baseline:${projectId}`]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`trello:${projectId}`]);
    await assertManager(client,projectId,actor);
    const previous=await latestBaseline(client,projectId);
    if ((previous?.version??0)!==expectedVersion) throw new SupervisionError('CONFLICT');
    const latest=(await client.query<{id:string}>('SELECT id FROM trello_snapshots WHERE project_id=$1 ORDER BY imported_at DESC,id DESC LIMIT 1',[projectId])).rows[0];
    if (!latest) throw new SupervisionError('NO_DATA');
    if (latest.id!==snapshotId) throw new SupervisionError('SOURCE_CHANGED');
    await client.query('INSERT INTO baseline_versions (project_id,version,snapshot_id,confirmed_by) VALUES ($1,$2,$3,$4)',[projectId,expectedVersion+1,snapshotId,actor.id]);
    await client.query('INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,$5,$6,$7)',[projectId,'user',actor.id,'baseline.confirm','baseline_version',`${projectId}:v${expectedVersion+1}`,'succeeded']);
    const result=await latestBaseline(client,projectId);
    await client.query('COMMIT'); return result!;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
