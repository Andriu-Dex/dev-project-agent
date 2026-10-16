exports.up = pgm => {
  pgm.createTable('github_connections', {
    project_id: { type: 'uuid', primaryKey: true, references: 'projects', onDelete: 'RESTRICT' },
    owner: { type: 'text', notNull: true }, repository: { type: 'text', notNull: true }, branch: { type: 'text', notNull: true },
  });
  pgm.sql("INSERT INTO github_connections (project_id,owner,repository,branch) SELECT id,'Andriu-Dex','utaped','develop' FROM projects WHERE name='UTAPED' ORDER BY created_at,id LIMIT 1");
  pgm.createTable('github_snapshots', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: 'github_connections', onDelete: 'RESTRICT' },
    observed_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    data: { type: 'jsonb', notNull: true },
  });
  pgm.addConstraint('github_snapshots', 'github_snapshots_project_id_id_key', { unique: ['project_id','id'] });
  pgm.createIndex('github_snapshots', ['project_id','observed_at']);
  pgm.createTable('github_sync_attempts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: 'github_connections', onDelete: 'RESTRICT' },
    status: { type: 'text', notNull: true, check: "status IN ('succeeded','failed')" },
    attempted_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') }, error_code: { type: 'text' },
  });
  pgm.addConstraint('trello_snapshots', 'trello_snapshots_project_id_id_key', { unique: ['project_id','id'] });
  pgm.createTable('baseline_versions', {
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'RESTRICT' },
    version: { type: 'integer', notNull: true, check: 'version > 0' }, snapshot_id: { type: 'uuid', notNull: true },
    confirmed_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    confirmed_by: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
  });
  pgm.addConstraint('baseline_versions','baseline_versions_pkey',{ primaryKey:['project_id','version'] });
  pgm.addConstraint('baseline_versions','baseline_versions_snapshot_fkey',{ foreignKeys:{ columns:['project_id','snapshot_id'], references:'trello_snapshots (project_id,id)', onDelete:'RESTRICT' } });
  pgm.createTable('supervision_jobs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'RESTRICT' },
    requested_by: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    requested_auth_version: { type: 'integer', notNull: true }, request_key: { type: 'uuid', notNull: true },
    kind: { type: 'text', notNull: true, check: "kind IN ('trello_sync','github_sync','analysis','full')" },
    status: { type: 'text', notNull: true, default: 'queued', check: "status IN ('queued','running','succeeded','partial','failed')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    started_at: { type: 'timestamptz' }, finished_at: { type: 'timestamptz' },
    attempt: { type: 'integer', notNull: true, default: 0, check: 'attempt BETWEEN 0 AND 3' },
    lease_token: { type: 'uuid' }, lease_expires_at: { type: 'timestamptz' }, error_code: { type: 'text' },
  });
  pgm.addConstraint('supervision_jobs','supervision_jobs_project_id_id_key',{unique:['project_id','id']});
  pgm.addConstraint('supervision_jobs','supervision_jobs_request_key',{unique:['project_id','requested_by','request_key']});
  pgm.createIndex('supervision_jobs','project_id',{unique:true,where:"status IN ('queued','running')",name:'supervision_jobs_active_project_key'});
  pgm.createIndex('supervision_jobs',['status','created_at']);
  pgm.createTable('supervision_job_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') }, project_id: { type: 'uuid', notNull: true }, job_id: { type: 'uuid', notNull: true },
    stage: { type: 'text', notNull: true }, outcome: { type: 'text', notNull: true, check: "outcome IN ('started','succeeded','failed','recovered')" },
    error_code: { type: 'text' }, created_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
  });
  pgm.addConstraint('supervision_job_events','supervision_job_events_job_fkey',{foreignKeys:{columns:['project_id','job_id'],references:'supervision_jobs (project_id,id)',onDelete:'RESTRICT'}});
  pgm.createIndex('supervision_job_events',['job_id','created_at']);
  pgm.createTable('supervision_runs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') }, project_id: { type: 'uuid', notNull: true }, job_id: { type: 'uuid', notNull: true, unique:true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    status: { type: 'text', notNull: true, check: "status IN ('complete','partial')" },
    trello_snapshot_id: { type: 'uuid' }, github_snapshot_id: { type: 'uuid' }, policy_version: { type: 'integer', notNull: true },
    baseline_version: { type: 'integer' }, result: { type: 'jsonb', notNull: true },
  });
  for (const [suffix,columns,reference] of [
    ['job',['project_id','job_id'],'supervision_jobs (project_id,id)'],
    ['trello',['project_id','trello_snapshot_id'],'trello_snapshots (project_id,id)'],
    ['github',['project_id','github_snapshot_id'],'github_snapshots (project_id,id)'],
    ['policy',['project_id','policy_version'],'tracking_policy_versions (project_id,version)'],
    ['baseline',['project_id','baseline_version'],'baseline_versions (project_id,version)'],
  ]) pgm.addConstraint('supervision_runs',`supervision_runs_${suffix}_fkey`,{foreignKeys:{columns,references:reference,onDelete:'RESTRICT'}});
  pgm.createIndex('supervision_runs',['project_id','created_at']);
  pgm.sql('GRANT SELECT ON github_connections TO dev_project_agent_app');
  pgm.sql('GRANT SELECT, INSERT ON github_snapshots, github_sync_attempts, baseline_versions, supervision_job_events, supervision_runs TO dev_project_agent_app');
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON supervision_jobs TO dev_project_agent_app');
};
exports.down = pgm => {
  for (const table of ['supervision_runs','supervision_job_events','supervision_jobs','baseline_versions','github_sync_attempts','github_snapshots','github_connections']) pgm.dropTable(table);
  pgm.dropConstraint('trello_snapshots','trello_snapshots_project_id_id_key');
};
