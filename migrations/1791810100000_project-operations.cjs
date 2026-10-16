exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE operation_configurations (
      project_id uuid REFERENCES projects NOT NULL, version integer NOT NULL CHECK(version>0),
      enabled boolean NOT NULL DEFAULT false, interval_minutes integer NOT NULL CHECK(interval_minutes BETWEEN 5 AND 10080),
      code_enabled boolean NOT NULL DEFAULT false, code_hour integer NOT NULL CHECK(code_hour BETWEEN 0 AND 23),
      code_with_ai boolean NOT NULL DEFAULT false, model text, reasoning_effort text,
      consent boolean NOT NULL DEFAULT false, max_files integer NOT NULL CHECK(max_files BETWEEN 1 AND 100),
      changed_by uuid REFERENCES users NOT NULL, auth_version integer NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,version),
      CHECK(NOT code_with_ai OR (consent AND model IS NOT NULL))
    );
    CREATE TABLE operation_cursors (
      project_id uuid REFERENCES projects PRIMARY KEY, configuration_version integer NOT NULL,
      next_sync timestamptz, next_code timestamptz, lease_token uuid, lease_until timestamptz,
      last_error text, code_inventory jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE operation_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      configuration_version integer NOT NULL, kind text NOT NULL CHECK(kind IN ('sources','code')),
      occurrence timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('started','succeeded','partial','failed','suspended')),
      detail jsonb NOT NULL DEFAULT '{}', started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
      UNIQUE(project_id,configuration_version,kind,occurrence)
    );
    CREATE TABLE project_alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      item_id text NOT NULL, code text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
      first_seen timestamptz NOT NULL, last_seen timestamptz NOT NULL, run_id uuid REFERENCES supervision_runs,
      payload jsonb NOT NULL, UNIQUE(project_id,item_id,code)
    );
    CREATE TABLE alert_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
      alert_id uuid REFERENCES project_alerts NOT NULL, action text NOT NULL CHECK(action IN ('opened','reopened','observed','acknowledged','resolved','cause_confirmed')),
      actor_id uuid REFERENCES users, run_id uuid REFERENCES supervision_runs, detail jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE UNIQUE INDEX alert_observation_once ON alert_events(alert_id,run_id) WHERE action IN ('opened','reopened','observed');
    GRANT SELECT,INSERT ON operation_configurations,alert_events TO dev_project_agent_app;
    GRANT SELECT,INSERT,UPDATE ON operation_cursors,operation_runs,project_alerts TO dev_project_agent_app;
  `);
};
exports.down = pgm => {pgm.dropTable('alert_events');pgm.dropTable('project_alerts');pgm.dropTable('operation_runs');pgm.dropTable('operation_cursors');pgm.dropTable('operation_configurations');};
