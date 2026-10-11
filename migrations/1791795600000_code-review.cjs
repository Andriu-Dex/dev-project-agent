exports.up=pgm=>{
  pgm.sql(`
    CREATE TABLE code_analyses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects,
      requested_by uuid NOT NULL REFERENCES users, request_key uuid NOT NULL, request_hash text NOT NULL,
      model text, reasoning_effort text,
      status text NOT NULL CHECK (status IN ('running','ready','failed','interrupted')),
      error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
      UNIQUE(project_id,id), UNIQUE(project_id,requested_by,request_key)
    );
    CREATE UNIQUE INDEX code_analyses_active ON code_analyses(project_id) WHERE status='running';
    CREATE TABLE code_sources (
      project_id uuid NOT NULL, analysis_id uuid NOT NULL, source jsonb NOT NULL,
      PRIMARY KEY(project_id,analysis_id), FOREIGN KEY(project_id,analysis_id) REFERENCES code_analyses(project_id,id)
    );
    CREATE TABLE code_results (
      project_id uuid NOT NULL, analysis_id uuid NOT NULL, result jsonb NOT NULL, usage jsonb, duration_ms integer,
      PRIMARY KEY(project_id,analysis_id), FOREIGN KEY(project_id,analysis_id) REFERENCES code_analyses(project_id,id)
    );
    CREATE TABLE code_proposals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects,
      created_by uuid NOT NULL REFERENCES users, latest_version integer NOT NULL DEFAULT 1,
      purpose text NOT NULL DEFAULT 'demonstration' CHECK(purpose='demonstration'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(project_id,id)
    );
    CREATE TABLE code_versions (
      project_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
      analysis_id uuid NOT NULL, goal text NOT NULL, finding_ids jsonb NOT NULL,
      state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','pending_review','pending_policy_check','pending_human_approval','authorized','changes_requested','rejected','invalidated')),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(project_id,proposal_id,version),
      FOREIGN KEY(project_id,proposal_id) REFERENCES code_proposals(project_id,id),
      FOREIGN KEY(project_id,analysis_id) REFERENCES code_analyses(project_id,id)
    );
    CREATE TABLE code_candidates (
      project_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL,
      content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), candidate jsonb NOT NULL,
      PRIMARY KEY(project_id,proposal_id,version),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES code_versions(project_id,proposal_id,version)
    );
    CREATE TABLE code_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL,
      requested_by uuid NOT NULL REFERENCES users, request_key uuid NOT NULL, request_hash text NOT NULL,
      model text NOT NULL, reasoning_effort text, status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','succeeded','failed','interrupted')),
      error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
      UNIQUE(project_id,id), UNIQUE(project_id,requested_by,request_key),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES code_versions(project_id,proposal_id,version)
    );
    CREATE UNIQUE INDEX code_jobs_active ON code_jobs(project_id) WHERE status='running';
    CREATE TABLE code_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL,
      job_id uuid NOT NULL, stage text NOT NULL CHECK(stage IN ('executor','reviewer','approver')),
      status text NOT NULL CHECK(status IN ('succeeded','failed')), input_hash text NOT NULL, output jsonb,
      error_code text, duration_ms integer, usage jsonb, model text NOT NULL, reasoning_effort text,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES code_versions(project_id,proposal_id,version),
      FOREIGN KEY(project_id,job_id) REFERENCES code_jobs(project_id,id)
    );
    CREATE UNIQUE INDEX code_messages_stage ON code_messages(project_id,proposal_id,version,stage) WHERE status='succeeded';
    CREATE TABLE code_decisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL,
      actor_id uuid NOT NULL REFERENCES users, auth_version integer NOT NULL, request_key uuid NOT NULL, content_hash text NOT NULL,
      decision text NOT NULL CHECK(decision IN ('approved','rejected','changes_requested')), reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(project_id,actor_id,request_key), UNIQUE(project_id,proposal_id,version),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES code_versions(project_id,proposal_id,version)
    );
    CREATE TABLE code_publications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, proposal_id uuid NOT NULL, version integer NOT NULL,
      actor_id uuid NOT NULL REFERENCES users, request_key uuid NOT NULL, content_hash text NOT NULL,
      plan jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(project_id,actor_id,request_key), UNIQUE(project_id,proposal_id,version),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES code_versions(project_id,proposal_id,version)
    );
    GRANT SELECT,INSERT ON code_analyses,code_sources,code_results,code_proposals,code_versions,code_candidates,code_jobs,code_messages,code_decisions,code_publications TO dev_project_agent_app;
    GRANT UPDATE(status,error_code,finished_at) ON code_analyses,code_jobs TO dev_project_agent_app;
    GRANT UPDATE(latest_version) ON code_proposals TO dev_project_agent_app;
    GRANT UPDATE(state) ON code_versions TO dev_project_agent_app;
  `);
};
exports.down=pgm=>{for(const table of ['code_publications','code_decisions','code_messages','code_jobs','code_candidates','code_versions','code_proposals','code_results','code_sources','code_analyses'])pgm.dropTable(table);};
