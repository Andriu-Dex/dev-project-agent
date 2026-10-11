exports.up = pgm => {
  pgm.addColumn('proposals',{purpose:{type:'text',notNull:true,default:'demonstration',check:"purpose IN ('demonstration','live')"}});
  pgm.addColumn('proposal_decisions',{actor_auth_version:{type:'integer'}});
  pgm.addConstraint('proposal_decisions','proposal_decisions_project_id_id_key',{unique:['project_id','id']});
  pgm.dropConstraint('proposal_versions','proposal_versions_state_check');
  pgm.addConstraint('proposal_versions','proposal_versions_state_check',"CHECK (state IN ('draft','pending_review','in_review','pending_policy_check','in_policy_check','pending_human_approval','authorized','changes_requested','rejected','invalidated','executing','executed','execution_failed','reconciliation_required'))");
  pgm.createTable('execution_jobs',{
    id:{type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},project_id:{type:'uuid',notNull:true},proposal_id:{type:'uuid',notNull:true},version:{type:'integer',notNull:true},
    approval_id:{type:'uuid',notNull:true},requested_by:{type:'uuid',notNull:true,references:'users'},requested_auth_version:{type:'integer',notNull:true},
    request_key:{type:'uuid',notNull:true},request_hash:{type:'text',notNull:true},content_hash:{type:'text',notNull:true},
    status:{type:'text',notNull:true,default:'queued',check:"status IN ('queued','running','succeeded','blocked','failed','reconciliation_required')"},
    error_code:{type:'text'},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},started_at:{type:'timestamptz'},write_started_at:{type:'timestamptz'},finished_at:{type:'timestamptz'},
  });
  pgm.addConstraint('execution_jobs','execution_jobs_project_id_id_key',{unique:['project_id','id']});
  pgm.addConstraint('execution_jobs','execution_jobs_request_key',{unique:['project_id','requested_by','request_key']});
  pgm.addConstraint('execution_jobs','execution_jobs_version_fkey',{foreignKeys:{columns:['project_id','proposal_id','version'],references:'proposal_versions (project_id,proposal_id,version)'}});
  pgm.addConstraint('execution_jobs','execution_jobs_approval_fkey',{foreignKeys:{columns:['project_id','approval_id'],references:'proposal_decisions (project_id,id)'}});
  pgm.createIndex('execution_jobs','project_id',{unique:true,where:"status IN ('queued','running','reconciliation_required')",name:'execution_jobs_active_project_key'});
  pgm.createTable('execution_events',{
    id:{type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},project_id:{type:'uuid',notNull:true},job_id:{type:'uuid',notNull:true},
    stage:{type:'text',notNull:true,check:"stage IN ('request','preflight','write','verification','reconciliation','recovery')"},
    outcome:{type:'text',notNull:true,check:"outcome IN ('requested','started','succeeded','failed','uncertain')"},error_code:{type:'text'},evidence:{type:'jsonb'},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
  });
  pgm.addConstraint('execution_events','execution_events_job_fkey',{foreignKeys:{columns:['project_id','job_id'],references:'execution_jobs (project_id,id)'}});
  pgm.sql('GRANT SELECT, INSERT ON execution_jobs, execution_events TO dev_project_agent_app');
  pgm.sql('GRANT UPDATE (status,error_code,started_at,write_started_at,finished_at) ON execution_jobs TO dev_project_agent_app');
};
exports.down = pgm => {
  pgm.dropTable('execution_events');pgm.dropTable('execution_jobs');
  pgm.sql("UPDATE proposal_versions SET state='invalidated' WHERE state IN ('executing','executed','execution_failed','reconciliation_required')");
  pgm.dropConstraint('proposal_versions','proposal_versions_state_check');
  pgm.addConstraint('proposal_versions','proposal_versions_state_check',"CHECK (state IN ('draft','pending_review','in_review','pending_policy_check','in_policy_check','pending_human_approval','authorized','changes_requested','rejected','invalidated'))");
  pgm.dropConstraint('proposal_decisions','proposal_decisions_project_id_id_key');pgm.dropColumn('proposal_decisions','actor_auth_version');pgm.dropColumn('proposals','purpose');
};
