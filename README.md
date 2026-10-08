# Dev Project Agent

Assistant for the UTAPED project manager: planning supervision, Trello integration, delay detection, weekly reporting, and code review through three specialized agents.

## Status

Implementation started on October 7, 2026. Academic deadline: November 4, 2026. Four team members. The application includes a React dashboard with light/dark themes, Fastify service, shared contracts, local PostgreSQL, password authentication, persistent sessions, and project permissions. Source connections, agents, proposals, and reports are not implemented yet. See [implementation status](docs/implementation-status.md) for scope and verification.

Repository: https://github.com/Andriu-Dex/dev-project-agent

The local folder remains named utaped-agent; renaming it is not required.

Supervised project: https://github.com/Andriu-Dex/utaped

Confirmed planning source: Trello board “UTAPED - UTA Planificación y Evidencias Docentes”, ID 6a95a200128aa8ce9dd216c0. Invitation links and tokens are not stored in documentation.

Local supervised checkout: C:\Documentos\D-Proyectos\Git\utaped.

## Confirmed decisions

- Independent Node.js/TypeScript service, React/TypeScript dashboard, and PostgreSQL persistence.
- Explicit sequential Executor, Reviewer, and Approver coordination, without an agent framework initially.
- Planned provider: ChatGPT through official authentication, subject to eligibility, quota, and integration validation. Ollama remains an alternative to evaluate.
- Weekly reports on Fridays at 18:00, America/Guayaquil.
- The human manager approves every Trello or code modification; other members initially have read-only access.
- Confirmed manager: Steven Eduardo Paredes Medina, Trello username andrewuzumaki, display name “andrew uzumaki”.
- Code corrections are prepared in branches and reviewed; humans perform final integration.
- dev-project-agent: development on develop; validated final release on main.
- UTAPED: approved corrections on agent/<proposal-id>-v<version>, PRs to develop; humans merge into develop and later main.
- English for filenames, code, code comments, logs, commits, PR metadata, README.md, and repository instructions. Spanish for application end-user content. Personal documentation inside docs/ may remain in Spanish by explicit user exception. Preserve source values and proper names.

## Documentation

- [Implementation status and provider validation](docs/implementation-status.md)
- [Git conventions](docs/git-conventions.md)
- [Standards and quality criteria](docs/standards-and-quality.md)
- [Reports and operations](docs/reports-and-operations.md)
- [Technical design](docs/technical-design.md)
- [API design](docs/api-design.md)
- [PostgreSQL conceptual model](docs/data-model.md)
- [Manager screens](docs/manager-screens.md)
- [Manager workflows](docs/manager-workflows.md)
- [Agent data contracts](docs/data-contracts.md)
- [Proposal workflow](docs/proposal-workflow.md)
- [Requirements and acceptance](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Business rules](docs/business-rules.md)
- [Work plan](docs/work-plan.md)
- [Trello export validation](docs/trello-validation.md)

## Remaining work

The fourth export was validated: 25 activities and six milestones, with 14 activities declared complete (56%). All six milestones have a due time of 17:00 and no native start, consistent with their descriptions. Steven and the branch workflow are confirmed.

Standards, report format, frequencies, priority, and blocking defaults are documented as proposals in docs/reports-and-operations.md. Review remaining proposed values before implementation. Provider validation and dependency compatibility remain technical checks for implementation.

## Repository preparation

The initial commit contains planning and Git configuration. Commit 9a764ff adds the application foundation and theme support. Implementation continues on develop; commits are kept local unless a push is requested.

.editorconfig, .gitattributes, .gitignore, and AGENTS.md define repository conventions. The private docs/utaped-trello.json export remains local and ignored because it contains profiles, history, and links. package-lock.json records dependencies. Local credentials are generated in an ignored .env file and never printed by setup.

## Local development

Requirements: Node.js 24.19.0, npm 11, and Docker with Compose. Run commands from the repository root:

```sh
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run user:create
npm run dev
```

Dashboard: http://127.0.0.1:5174. Service: http://127.0.0.1:3100/api/v1/health. PostgreSQL uses loopback port 15434 and its own named volume. Existing UTAPED services are not reused or modified.

setup preserves existing .env values and appends missing session settings. If credentials change after database initialization, they must be rotated in PostgreSQL too; changing .env does not update existing roles. Do not remove the volume to repair credentials or reset data without reviewing what would be lost. Restart the service after changing environment settings.

Checks: npm run typecheck, npm test, npm run test:db, npm run test:auth-db, and npm run build. Database checks use rollback to avoid persisting test records. Authentication integration tests require the local migrated database and are skipped by the regular unit-test command. Build and run the dashboard/service together with npm run build followed by npm start at http://127.0.0.1:3100.

Stop local development with Ctrl+C; stop this database with npm run db:stop. All interfaces are local only. Remote deployment, HTTPS termination, and distributed rate limiting remain outside this local milestone.

## Local accounts

Run npm run user:create in an interactive terminal to create an account and its project membership. The first account defaults to manager; subsequent accounts default to viewer. Choose Steven's manager account explicitly. Password entry is masked, confirmation is required, and passwords must contain 15–128 characters. No default credentials or public registration endpoint exist. Administrative commands use the migration database role and must remain local.

Run npm run user:reset to change a password and revoke existing sessions. Password hashes use Argon2id. Sessions remain in PostgreSQL across service restarts, expire after 30 minutes of inactivity or eight hours from login, and use HttpOnly/SameSite cookies. Explicit loopback HTTP settings support local development; HTTPS configuration uses Secure cookies. Mutation endpoints require an allowed Origin and session CSRF token. Login is limited to ten attempts per minute per IP in this single-process version.

The manager can read project membership; viewers cannot. Permissions and account activity are checked against PostgreSQL on each protected request. Audit records include successful/denied logins, logout, account creation, password changes, and denied membership reads. The full proposal approval workflow is still pending. See [authentication operations](docs/authentication.md).

The first version runs locally. Scheduled jobs require the computer and service to be active. No additional API or hosting budget is available.
