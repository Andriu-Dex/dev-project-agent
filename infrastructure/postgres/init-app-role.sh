#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_DATABASE_PASSWORD
CREATE ROLE dev_project_agent_app LOGIN PASSWORD :'app_password';
REVOKE ALL ON DATABASE dev_project_agent FROM PUBLIC;
GRANT CONNECT ON DATABASE dev_project_agent TO dev_project_agent_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dev_project_agent_app;
SQL
