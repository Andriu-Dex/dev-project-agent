import type { AuthDatabase } from '../auth/repository.js';
export async function workProgress(database: AuthDatabase, projectId: string) {
    const jobs: {
        id: string;
        target: string;
        status: string;
        state: string;
        createdAt: string;
        finishedAt: string | null;
        lastActivity: string;
        completed: string[];
        errorCode: string | null;
        reviewedUnits?: number;
    }[] = [];
    // Table names are a fixed allowlist; request input never becomes SQL syntax.
    for (const [table, messages, target] of [['agent_jobs', 'agent_messages', 'proposals'], ['code_jobs', 'code_messages', 'code']] as const) {
        const rows = await database.query(`SELECT j.id,j.status,j.created_at,j.finished_at,j.error_code,
      COALESCE(MAX(m.created_at),j.created_at) AS last_activity,
      array_agg(DISTINCT m.stage) FILTER (WHERE m.status='succeeded') AS completed,
      v.state FROM ${table} j LEFT JOIN ${messages} m ON m.project_id=j.project_id AND m.proposal_id=j.proposal_id AND m.version=j.version
      JOIN ${target === 'code' ? 'code_versions' : 'proposal_versions'} v ON v.project_id=j.project_id AND v.proposal_id=j.proposal_id AND v.version=j.version
      WHERE j.project_id=$1 GROUP BY j.id,v.state ORDER BY j.created_at DESC LIMIT 5`, [projectId]);
        for (const row of rows.rows)
            jobs.push({ id: row.id, target, status: row.status, state: row.state, createdAt: row.created_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null, lastActivity: row.last_activity.toISOString(), completed: row.completed ?? [], errorCode: row.error_code });
    }
    for (const [table, target] of [['code_analyses', 'analysis'], ['supervision_jobs', 'supervision'], ['report_jobs', 'report']] as const) {
        const rows = await database.query(`SELECT id,status,created_at,finished_at,error_code FROM ${table} WHERE project_id=$1 ORDER BY created_at DESC LIMIT 3`, [projectId]);
        for (const row of rows.rows)
            jobs.push({ id: row.id, target, status: row.status, state: row.status, createdAt: row.created_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null, lastActivity: (row.finished_at ?? row.created_at).toISOString(), completed: [], errorCode: row.error_code });
    }
    const batches = await database.query('SELECT b.*,COALESCE((SELECT max(created_at) FROM code_coverage_results r WHERE r.batch_id=b.id),b.created_at) AS last_activity FROM code_coverage_batches b WHERE b.project_id=$1 ORDER BY b.created_at DESC LIMIT 3', [projectId]);
    for (const row of batches.rows)
        jobs.push({ id: row.id, target: 'coverage', status: row.status, state: row.status, createdAt: row.created_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null, lastActivity: row.last_activity.toISOString(), completed: [], errorCode: row.error_code, reviewedUnits: row.reviewed_units });
    return { checkedAt: new Date().toISOString(), jobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}
