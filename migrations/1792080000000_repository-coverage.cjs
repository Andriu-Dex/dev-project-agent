exports.up = pgm => pgm.sql(`
  CREATE TABLE code_coverage_projects (
    project_id uuid PRIMARY KEY REFERENCES projects,
    revision integer NOT NULL DEFAULT 1, head text NOT NULL, tree_sha text NOT NULL,
    connection jsonb NOT NULL, observed_at timestamptz NOT NULL,
    settings jsonb NOT NULL, enabled boolean NOT NULL DEFAULT false,
    requested_by uuid NOT NULL REFERENCES users, auth_version integer NOT NULL,
    next_run timestamptz, lease_token uuid, lease_until timestamptz, last_error text
  );
  CREATE TABLE code_coverage_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES code_coverage_projects,
    path text NOT NULL, blob_sha text NOT NULL, size integer, mode text NOT NULL,
    present boolean NOT NULL DEFAULT true, generation uuid NOT NULL DEFAULT gen_random_uuid(),
    state text NOT NULL CHECK(state IN ('pending','reviewing','reviewed','partial','outdated','failed','excluded')),
    reason text, completed_parts integer NOT NULL DEFAULT 0, total_parts integer,
    attempts integer NOT NULL DEFAULT 0, analysis_head text, dependencies jsonb NOT NULL DEFAULT '{}',
    UNIQUE(project_id,path), UNIQUE(project_id,id)
  );
  CREATE INDEX code_coverage_queue ON code_coverage_files(project_id,state,path) WHERE present;
  CREATE TABLE code_coverage_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES code_coverage_projects,
    head text NOT NULL, settings jsonb NOT NULL,
    status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','paused','failed','interrupted')),
    reviewed_units integer NOT NULL DEFAULT 0, error_code text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
    UNIQUE(project_id,id)
  );
  CREATE TABLE code_coverage_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, file_id uuid NOT NULL,
    batch_id uuid NOT NULL, generation uuid NOT NULL, part_index integer NOT NULL,
    head text NOT NULL, blob_sha text NOT NULL, line_start integer NOT NULL, line_end integer NOT NULL,
    context jsonb NOT NULL, result jsonb NOT NULL, usage jsonb, duration_ms integer,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(project_id,file_id) REFERENCES code_coverage_files(project_id,id),
    FOREIGN KEY(project_id,batch_id) REFERENCES code_coverage_batches(project_id,id),
    UNIQUE(file_id,generation,part_index)
  );
  GRANT SELECT,INSERT,UPDATE ON code_coverage_projects,code_coverage_files TO dev_project_agent_app;
  GRANT SELECT,INSERT ON code_coverage_batches TO dev_project_agent_app;
  GRANT UPDATE(status,reviewed_units,error_code,finished_at) ON code_coverage_batches TO dev_project_agent_app;
  GRANT SELECT,INSERT ON code_coverage_results TO dev_project_agent_app;
  CREATE TABLE code_coverage_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES code_coverage_projects,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), data jsonb NOT NULL
  );
  CREATE INDEX code_coverage_snapshots_cutoff ON code_coverage_snapshots(project_id,created_at DESC);
  GRANT SELECT,INSERT ON code_coverage_snapshots TO dev_project_agent_app;
`);
exports.down = pgm => {
  for (const table of ['code_coverage_snapshots','code_coverage_results','code_coverage_batches','code_coverage_files','code_coverage_projects']) pgm.dropTable(table);
};
