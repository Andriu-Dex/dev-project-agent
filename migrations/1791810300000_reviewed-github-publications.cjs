exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE code_proposals DROP CONSTRAINT code_proposals_purpose_check;
    ALTER TABLE code_proposals ADD CONSTRAINT code_proposals_purpose_check CHECK(purpose IN ('demonstration','live'));
    ALTER TABLE code_versions DROP CONSTRAINT code_versions_state_check;
    ALTER TABLE code_versions ADD CONSTRAINT code_versions_state_check CHECK(state IN ('draft','pending_review','pending_policy_check','pending_human_approval','authorized','changes_requested','rejected','invalidated','executing','executed','execution_failed','reconciliation_required'));
    CREATE TABLE github_publication_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects,
      proposal_id uuid NOT NULL, version integer NOT NULL, content_hash text NOT NULL,
      requested_by uuid NOT NULL REFERENCES users, auth_version integer NOT NULL, request_key uuid NOT NULL,
      approval_id uuid NOT NULL REFERENCES code_decisions, plan jsonb NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','reconciliation_required')),
      error_code text, write_started_at timestamptz, commit_sha text, pull_number integer, pull_url text,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
      UNIQUE(project_id,requested_by,request_key), UNIQUE(project_id,proposal_id,version),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES code_versions(project_id,proposal_id,version)
    );
    CREATE UNIQUE INDEX github_publication_active ON github_publication_jobs(project_id) WHERE status IN ('queued','running','reconciliation_required');
    CREATE TABLE github_publication_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      job_id uuid REFERENCES github_publication_jobs NOT NULL, stage text NOT NULL, outcome text NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    GRANT SELECT,INSERT ON github_publication_jobs,github_publication_events TO dev_project_agent_app;
    GRANT UPDATE(status,error_code,write_started_at,commit_sha,pull_number,pull_url,finished_at) ON github_publication_jobs TO dev_project_agent_app;
  `);
};
exports.down = pgm => {
  pgm.sql("DO $$ BEGIN IF EXISTS(SELECT 1 FROM code_proposals WHERE purpose='live') THEN RAISE EXCEPTION 'Live proposals must be retained'; END IF; END $$");
  pgm.dropTable('github_publication_events');pgm.dropTable('github_publication_jobs');
  pgm.sql("ALTER TABLE code_proposals DROP CONSTRAINT code_proposals_purpose_check; ALTER TABLE code_proposals ADD CONSTRAINT code_proposals_purpose_check CHECK(purpose='demonstration')");
};
