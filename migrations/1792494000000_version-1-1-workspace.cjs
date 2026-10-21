exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE report_results ADD COLUMN rendered_html text, ADD COLUMN render_hash text;
    ALTER TABLE report_jobs ADD COLUMN revision_reason text NOT NULL DEFAULT '';
    CREATE TABLE report_template_versions (
      project_id uuid REFERENCES projects NOT NULL, version integer NOT NULL,
      settings jsonb NOT NULL, changed_by uuid REFERENCES users NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,version)
    );
    CREATE TABLE report_document_keys (
      project_id uuid REFERENCES projects NOT NULL, kind text NOT NULL, cutoff timestamptz NOT NULL,
      sequence integer NOT NULL, PRIMARY KEY(project_id,kind,cutoff), UNIQUE(project_id,sequence)
    );
    CREATE TABLE assistant_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      user_id uuid REFERENCES users NOT NULL, request_key uuid NOT NULL, input text NOT NULL,
      response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(project_id,user_id,request_key)
    );
    CREATE TABLE reversal_links (
      project_id uuid REFERENCES projects NOT NULL, original_job_id uuid NOT NULL,
      proposal_id uuid NOT NULL, version integer NOT NULL, created_by uuid REFERENCES users NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(project_id,proposal_id,version),
      FOREIGN KEY(project_id,proposal_id,version) REFERENCES proposal_versions(project_id,proposal_id,version)
    );
    GRANT SELECT,INSERT ON report_template_versions,report_document_keys,assistant_messages,reversal_links TO dev_project_agent_app;
  `);
};
exports.down = pgm => {pgm.dropColumns('report_results',['rendered_html','render_hash']);pgm.dropColumns('report_jobs',['revision_reason']);pgm.dropTable('reversal_links');pgm.dropTable('assistant_messages');pgm.dropTable('report_document_keys');pgm.dropTable('report_template_versions');};
