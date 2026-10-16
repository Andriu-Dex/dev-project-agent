exports.up=pgm=>pgm.sql(`
  CREATE TABLE report_schedule_versions (
    project_id uuid NOT NULL REFERENCES projects, version integer NOT NULL CHECK(version>0),
    enabled boolean NOT NULL, weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),
    hour integer NOT NULL CHECK(hour BETWEEN 0 AND 23), minute integer NOT NULL CHECK(minute BETWEEN 0 AND 59),
    time_zone text NOT NULL DEFAULT 'America/Guayaquil' CHECK(time_zone='America/Guayaquil'),
    changed_by uuid NOT NULL REFERENCES users, auth_version integer NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(project_id,version)
  );
  CREATE TABLE report_schedule_cursors (
    project_id uuid PRIMARY KEY REFERENCES projects, version integer NOT NULL,
    period_start timestamptz NOT NULL, next_cutoff timestamptz NOT NULL,
    FOREIGN KEY(project_id,version) REFERENCES report_schedule_versions(project_id,version)
  );
  CREATE TABLE report_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects,
    kind text NOT NULL CHECK(kind IN ('scheduled','manual')), cutoff timestamptz NOT NULL, period_start timestamptz NOT NULL,
    schedule_version integer, requested_by uuid NOT NULL REFERENCES users, auth_version integer NOT NULL,
    request_key uuid NOT NULL, request_hash text NOT NULL, version integer NOT NULL CHECK(version>0),
    status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','published','draft','failed')),
    error_code text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
    UNIQUE(project_id,id), UNIQUE(project_id,kind,cutoff,version), UNIQUE(project_id,requested_by,request_key),
    FOREIGN KEY(project_id,schedule_version) REFERENCES report_schedule_versions(project_id,version),
    CHECK(period_start<=cutoff)
  );
  CREATE TABLE report_results (
    project_id uuid NOT NULL, report_id uuid NOT NULL, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
    data jsonb NOT NULL, PRIMARY KEY(project_id,report_id),
    FOREIGN KEY(project_id,report_id) REFERENCES report_jobs(project_id,id)
  );
  CREATE INDEX report_jobs_queue ON report_jobs(status,cutoff);
  GRANT SELECT,INSERT ON report_schedule_versions,report_jobs,report_results TO dev_project_agent_app;
  GRANT SELECT,INSERT,UPDATE ON report_schedule_cursors TO dev_project_agent_app;
  GRANT UPDATE(status,error_code,finished_at) ON report_jobs TO dev_project_agent_app;
`);
exports.down=pgm=>{for(const table of ['report_results','report_jobs','report_schedule_cursors','report_schedule_versions'])pgm.dropTable(table);};
