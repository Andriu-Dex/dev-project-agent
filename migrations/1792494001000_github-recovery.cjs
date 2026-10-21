exports.up = pgm => pgm.sql(`
  CREATE TABLE github_recovery_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
    publication_id uuid REFERENCES github_publication_jobs NOT NULL, requested_by uuid REFERENCES users NOT NULL,
    auth_version integer NOT NULL, request_key uuid NOT NULL, reason text NOT NULL, plan jsonb NOT NULL,
    content_hash text NOT NULL, status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','approved','running','succeeded','reconciliation_required')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(project_id,requested_by,request_key)
  );
  CREATE TABLE github_recovery_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recovery_id uuid REFERENCES github_recovery_requests NOT NULL,
    project_id uuid REFERENCES projects NOT NULL, actor_id uuid REFERENCES users NOT NULL,
    action text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  GRANT SELECT,INSERT ON github_recovery_requests,github_recovery_events TO dev_project_agent_app;
  GRANT UPDATE(status) ON github_recovery_requests TO dev_project_agent_app;
`);
exports.down = pgm => {pgm.dropTable('github_recovery_events');pgm.dropTable('github_recovery_requests');};
