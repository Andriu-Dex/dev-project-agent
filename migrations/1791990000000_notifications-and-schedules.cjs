exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE operation_configurations ADD COLUMN code_minute integer NOT NULL DEFAULT 0 CHECK(code_minute BETWEEN 0 AND 59),
      ADD COLUMN code_days integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6] CHECK(cardinality(code_days)>0 AND code_days <@ ARRAY[0,1,2,3,4,5,6]);
    CREATE TABLE notification_configurations (
      project_id uuid REFERENCES projects NOT NULL, version integer NOT NULL CHECK(version>0),
      settings jsonb NOT NULL, changed_by uuid REFERENCES users NOT NULL, auth_version integer NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,version)
    );
    CREATE TABLE notification_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      event_key text NOT NULL, kind text NOT NULL, source_id text NOT NULL, summary text NOT NULL,
      occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(project_id,event_key)
    );
    CREATE TABLE notification_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      configuration_version integer NOT NULL, request_key uuid NOT NULL, recipient text NOT NULL,
      kind text NOT NULL CHECK(kind IN ('notification','test')), event_ids uuid[] NOT NULL DEFAULT '{}',
      status text NOT NULL CHECK(status IN ('queued','sending','accepted','failed','uncertain','cancelled')),
      attempt_count integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(),
      error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
      UNIQUE(project_id,request_key)
    );
    CREATE INDEX notification_pending ON notification_deliveries(next_attempt) WHERE status='queued';
    GRANT SELECT,INSERT ON notification_configurations,notification_events TO dev_project_agent_app;
    GRANT SELECT,INSERT,UPDATE ON notification_deliveries TO dev_project_agent_app;
  `);
};
exports.down = pgm => {
  pgm.dropTable('notification_deliveries');pgm.dropTable('notification_events');pgm.dropTable('notification_configurations');
  pgm.dropColumns('operation_configurations',['code_minute','code_days']);
};
