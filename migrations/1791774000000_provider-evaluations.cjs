exports.up = pgm => {
  pgm.createTable('chatgpt_registrations', {
    project_id: {type:'uuid',notNull:true,references:'projects',onDelete:'RESTRICT'},
    user_id: {type:'uuid',notNull:true,references:'users',onDelete:'RESTRICT'},
    host_id: {type:'uuid',notNull:true,default:pgm.func('gen_random_uuid()')},
    client_id: {type:'text'}, subject: {type:'text'},
  });
  pgm.addConstraint('chatgpt_registrations','chatgpt_registrations_pkey',{primaryKey:['project_id','user_id']});
  pgm.createTable('provider_evaluations', {
    id: {type:'uuid',primaryKey:true,default:pgm.func('gen_random_uuid()')},
    project_id: {type:'uuid',notNull:true,references:'projects',onDelete:'RESTRICT'},
    requested_by: {type:'uuid',notNull:true,references:'users',onDelete:'RESTRICT'},
    request_key: {type:'uuid',notNull:true}, model: {type:'text',notNull:true},
    suite_version: {type:'text',notNull:true},
    status: {type:'text',notNull:true,check:"status IN ('running','passed','failed','interrupted')"},
    created_at: {type:'timestamptz',notNull:true,default:pgm.func('clock_timestamp()')},
    finished_at: {type:'timestamptz'}, error_code: {type:'text'},
  });
  pgm.addConstraint('provider_evaluations','provider_evaluations_request_key',{unique:['project_id','requested_by','request_key']});
  pgm.addConstraint('provider_evaluations','provider_evaluations_project_id_id_key',{unique:['project_id','id']});
  pgm.createIndex('provider_evaluations','project_id',{unique:true,where:"status='running'",name:'provider_evaluations_active_project_key'});
  pgm.createIndex('provider_evaluations',['project_id','created_at']);
  pgm.createTable('provider_evaluation_results', {
    evaluation_id: {type:'uuid',primaryKey:true}, project_id: {type:'uuid',notNull:true},
    result: {type:'jsonb',notNull:true},
  });
  pgm.addConstraint('provider_evaluation_results','provider_evaluation_results_evaluation_fkey',{foreignKeys:{columns:['project_id','evaluation_id'],references:'provider_evaluations (project_id,id)',onDelete:'RESTRICT'}});
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON chatgpt_registrations, provider_evaluations TO dev_project_agent_app');
  pgm.sql('GRANT SELECT, INSERT ON provider_evaluation_results TO dev_project_agent_app');
};
exports.down = pgm => {
  for(const name of ['provider_evaluation_results','provider_evaluations','chatgpt_registrations'])pgm.dropTable(name);
};
