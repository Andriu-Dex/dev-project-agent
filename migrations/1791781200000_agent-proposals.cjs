exports.up = pgm => {
  pgm.addColumn('provider_evaluations',{reasoning_effort:{type:'text',check:"reasoning_effort IN ('low','medium','high','xhigh','max')"}});
  pgm.createTable('proposals',{
    id:{type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},project_id:{type:'uuid',notNull:true,references:'projects',onDelete:'RESTRICT'},
    created_by:{type:'uuid',notNull:true,references:'users'},latest_version:{type:'integer',notNull:true,default:1},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
  });
  pgm.addConstraint('proposals','proposals_project_id_id_key',{unique:['project_id','id']});
  pgm.createTable('proposal_versions',{
    project_id:{type:'uuid',notNull:true},proposal_id:{type:'uuid',notNull:true},version:{type:'integer',notNull:true,check:'version>0'},
    source_run_id:{type:'uuid',notNull:true},context:{type:'jsonb',notNull:true},goal:{type:'text',notNull:true},requested_due:{type:'timestamptz',notNull:true},
    created_by:{type:'uuid',notNull:true,references:'users'},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
    state:{type:'text',notNull:true,default:'draft',check:"state IN ('draft','pending_review','in_review','pending_policy_check','in_policy_check','pending_human_approval','authorized','changes_requested','rejected','invalidated')"},
  });
  pgm.addConstraint('proposal_versions','proposal_versions_pkey',{primaryKey:['project_id','proposal_id','version']});
  pgm.addConstraint('proposal_versions','proposal_versions_proposal_fkey',{foreignKeys:{columns:['project_id','proposal_id'],references:'proposals (project_id,id)',onDelete:'RESTRICT'}});
  pgm.addConstraint('supervision_runs','supervision_runs_project_id_id_key',{unique:['project_id','id']});
  pgm.addConstraint('proposal_versions','proposal_versions_run_fkey',{foreignKeys:{columns:['project_id','source_run_id'],references:'supervision_runs (project_id,id)',onDelete:'RESTRICT'}});
  pgm.createTable('proposal_contents',{
    project_id:{type:'uuid',notNull:true},proposal_id:{type:'uuid',notNull:true},version:{type:'integer',notNull:true},
    content_hash:{type:'text',notNull:true},content:{type:'jsonb',notNull:true},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
  });
  pgm.addConstraint('proposal_contents','proposal_contents_pkey',{primaryKey:['project_id','proposal_id','version']});
  pgm.createTable('agent_jobs',{
    id:{type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},project_id:{type:'uuid',notNull:true},proposal_id:{type:'uuid',notNull:true},version:{type:'integer',notNull:true},
    requested_by:{type:'uuid',notNull:true,references:'users'},request_key:{type:'uuid',notNull:true},request_hash:{type:'text',notNull:true},
    model:{type:'text',notNull:true},reasoning_effort:{type:'text'},status:{type:'text',notNull:true,default:'running',check:"status IN ('running','succeeded','failed','interrupted')"},
    created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},finished_at:{type:'timestamptz'},error_code:{type:'text'},
  });
  pgm.addConstraint('agent_jobs','agent_jobs_project_id_id_key',{unique:['project_id','id']});
  pgm.addConstraint('agent_jobs','agent_jobs_request_key',{unique:['project_id','requested_by','request_key']});
  pgm.createIndex('agent_jobs','project_id',{unique:true,where:"status='running'",name:'agent_jobs_active_project_key'});
  pgm.createTable('agent_messages',{
    id:{type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},project_id:{type:'uuid',notNull:true},proposal_id:{type:'uuid',notNull:true},version:{type:'integer',notNull:true},job_id:{type:'uuid',notNull:true},
    stage:{type:'text',notNull:true,check:"stage IN ('executor','reviewer','approver')"},status:{type:'text',notNull:true,check:"status IN ('succeeded','failed')"},
    input:{type:'jsonb',notNull:true},output:{type:'jsonb'},error_code:{type:'text'},duration_ms:{type:'integer'},usage:{type:'jsonb'},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
  });
  pgm.addConstraint('agent_messages','agent_messages_job_fkey',{foreignKeys:{columns:['project_id','job_id'],references:'agent_jobs (project_id,id)'}});
  pgm.createTable('proposal_decisions',{
    id:{type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},project_id:{type:'uuid',notNull:true},proposal_id:{type:'uuid',notNull:true},version:{type:'integer',notNull:true},
    actor_id:{type:'uuid',notNull:true,references:'users'},content_hash:{type:'text',notNull:true},request_key:{type:'uuid',notNull:true},
    decision:{type:'text',notNull:true,check:"decision IN ('approved','rejected','changes_requested')"},reason:{type:'text',notNull:true},created_at:{type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
  });
  pgm.addConstraint('proposal_decisions','proposal_decisions_version_key',{unique:['project_id','proposal_id','version']});
  pgm.addConstraint('proposal_decisions','proposal_decisions_request_key',{unique:['project_id','actor_id','request_key']});
  for(const table of ['proposal_contents','agent_jobs','agent_messages','proposal_decisions'])pgm.addConstraint(table,table+'_version_fkey',{foreignKeys:{columns:['project_id','proposal_id','version'],references:'proposal_versions (project_id,proposal_id,version)'}});
  pgm.sql('GRANT SELECT, INSERT ON proposals, proposal_versions, proposal_contents, agent_jobs, agent_messages, proposal_decisions TO dev_project_agent_app');
  pgm.sql('GRANT UPDATE (latest_version) ON proposals TO dev_project_agent_app');
  pgm.sql('GRANT UPDATE (state) ON proposal_versions TO dev_project_agent_app');
  pgm.sql('GRANT UPDATE (status, finished_at, error_code) ON agent_jobs TO dev_project_agent_app');
};
exports.down=pgm=>{
  for(const table of ['proposal_decisions','agent_messages','agent_jobs','proposal_contents','proposal_versions','proposals'])pgm.dropTable(table);
  pgm.dropConstraint('supervision_runs','supervision_runs_project_id_id_key');pgm.dropColumn('provider_evaluations','reasoning_effort');
};
