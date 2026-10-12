import type {SupervisionResult,TrelloSnapshot} from '@dev-project-agent/contracts';
import type {AuthDatabase,AuthUser} from '../auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {readTrackingPolicy} from '../tracking/policy.js';
import {assertManager} from '../supervision/access.js';
import {riskAssessment} from './risks.js';
import {OperationError} from './service.js';

export async function persistAlerts(database:AuthDatabase,projectId:string,runId:string,result:SupervisionResult,policyVersion?:number) {
  if(!result.tracking?.source||result.tracking.source.freshness!=='recent')return;
  const source=(await database.query<{data:TrelloSnapshot}>('SELECT data FROM trello_snapshots WHERE project_id=$1 AND id=$2',[projectId,result.trelloSnapshotId])).rows[0];
  const policy=await readTrackingPolicy(database,projectId,policyVersion);if(!source||!policy)return;
  const retained:string[]=[];
  for(const finding of result.tracking.findings){
    const previous=(await database.query<{id:string;status:string;run_id:string}>('SELECT id,status,run_id FROM project_alerts WHERE project_id=$1 AND item_id=$2 AND code=$3 FOR UPDATE',[projectId,finding.itemId,finding.code])).rows[0];
    const payload={finding,assessment:riskAssessment(source.data,finding,policy),snapshotId:result.trelloSnapshotId,policyVersion:policy.version};
    const row=(await database.query<{id:string}>(`INSERT INTO project_alerts(project_id,item_id,code,first_seen,last_seen,run_id,payload) VALUES($1,$2,$3,$4,$4,$5,$6) ON CONFLICT(project_id,item_id,code) DO UPDATE SET last_seen=$4,run_id=$5,payload=$6,status=CASE WHEN project_alerts.status='resolved' THEN 'open' ELSE project_alerts.status END RETURNING id`,[projectId,finding.itemId,finding.code,result.evaluatedAt,runId,JSON.stringify(payload)])).rows[0]!;retained.push(row.id);
    await database.query(`INSERT INTO alert_events(project_id,alert_id,action,run_id,detail) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[projectId,row.id,!previous?'opened':previous.status==='resolved'?'reopened':'observed',runId,JSON.stringify({snapshotId:result.trelloSnapshotId})]);
  }
  const resolved=(await database.query<{id:string}>("UPDATE project_alerts SET status='resolved',run_id=$3 WHERE project_id=$1 AND status<>'resolved' AND NOT(id=ANY($2::uuid[])) RETURNING id",[projectId,retained,runId])).rows;
  for(const row of resolved)await database.query("INSERT INTO alert_events(project_id,alert_id,action,run_id) VALUES($1,$2,'resolved',$3)",[projectId,row.id,runId]);
}
export async function alertOverview(database:AuthDatabase,projectId:string) {
  const alerts=(await database.query('SELECT * FROM project_alerts WHERE project_id=$1 ORDER BY (status=\'resolved\'),last_seen DESC,id LIMIT 200',[projectId])).rows;
  const events=(await database.query('SELECT e.id,e.alert_id,e.action,e.detail,e.created_at,e.run_id,u.display_name AS actor FROM alert_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.project_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 200',[projectId])).rows;
  return {alerts,events,limit:200};
}
export async function acknowledgeAlert(database:TrelloDatabase,projectId:string,id:string,actor:AuthUser,note:string,confirmedCause?:string) {
  if(note.trim().length<3||note.length>2000||confirmedCause!==undefined&&(!confirmedCause.trim()||confirmedCause.length>2000))throw new OperationError('INVALID_REQUEST');
  const client=await database.connect();try{await client.query('BEGIN');await assertManager(client,projectId,actor);
    const row=(await client.query<{status:string}>('SELECT status FROM project_alerts WHERE project_id=$1 AND id=$2 FOR UPDATE',[projectId,id])).rows[0];if(!row)throw new OperationError('NOT_FOUND');if(row.status==='resolved')throw new OperationError('CONFLICT');
    await client.query("UPDATE project_alerts SET status='acknowledged' WHERE project_id=$1 AND id=$2",[projectId,id]);
    await client.query('INSERT INTO alert_events(project_id,alert_id,action,actor_id,detail) VALUES($1,$2,$3,$4,$5)',[projectId,id,confirmedCause?'cause_confirmed':'acknowledged',actor.id,JSON.stringify({note:note.trim(),...(confirmedCause?{confirmedCause:confirmedCause.trim()}:{}),authorization:false})]);
    await client.query('INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,\'user\',$2,\'alert.acknowledge\',\'project_alert\',$3,\'succeeded\')',[projectId,actor.id,id]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  return alertOverview(database,projectId);
}
