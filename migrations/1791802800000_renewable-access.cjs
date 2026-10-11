exports.up=pgm=>pgm.sql(`
  CREATE TABLE chatgpt_credentials (
    project_id uuid NOT NULL, user_id uuid NOT NULL, auth_version integer NOT NULL,
    ciphertext text, models jsonb NOT NULL DEFAULT '[]', expires_at timestamptz NOT NULL,
    earliest_refresh_at timestamptz NOT NULL, retry_at timestamptz,
    state text NOT NULL CHECK(state IN ('active','refreshing','reauthorization_required','disconnected')),
    revision integer NOT NULL DEFAULT 1, failures integer NOT NULL DEFAULT 0,
    error_code text, refreshed_at timestamptz,
    PRIMARY KEY(project_id,user_id),
    FOREIGN KEY(project_id,user_id) REFERENCES chatgpt_registrations(project_id,user_id)
  );
  GRANT SELECT,INSERT,UPDATE ON chatgpt_credentials TO dev_project_agent_app;
`);
exports.down=pgm=>pgm.dropTable('chatgpt_credentials');
