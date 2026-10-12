# Dev Project Agent

Assistant for the UTAPED project manager: planning supervision, Trello integration, delay detection, weekly reporting, and code review through three specialized agents.

## Status

Implementation started on October 7, 2026. Academic deadline: November 4, 2026. Four team members. The application includes a React dashboard with light/dark themes, Fastify service, shared contracts, local PostgreSQL, password authentication, persistent sessions, project permissions, read-only Trello/GitHub synchronization, deterministic tracking, baseline confirmation, persistent supervision jobs, frozen analysis history, renewable encrypted ChatGPT access, synthetic provider evaluations, model reasoning selection, sequential proposal agents, immutable versions and manager decisions. Bounded code review and simulated GitHub publication are implemented. Weekly reports include configurable scheduling, missed-cutoff recovery, frozen versions, deterministic publication checks and printable A4 output. Controlled Trello execution is tested with synthetic requests; real writes remain disabled. Demonstrations are permanently non-executable. See [implementation status](docs/implementation-status.md) for verified scope and remaining work.

Repository: https://github.com/Andriu-Dex/dev-project-agent

The local folder remains named utaped-agent; renaming it is not required.

Supervised project: https://github.com/Andriu-Dex/utaped

Confirmed planning source: Trello board “UTAPED - UTA Planificación y Evidencias Docentes”, ID 6a95a200128aa8ce9dd216c0. Invitation links and tokens are not stored in documentation.

Local supervised checkout: C:\Documentos\D-Proyectos\Git\utaped.

## Confirmed decisions

- Independent Node.js/TypeScript service, React/TypeScript dashboard, and PostgreSQL persistence.
- Explicit sequential Executor, Reviewer, and Approver coordination, without an agent framework initially.
- Provider: ChatGPT through official authentication; account authorization and a synthetic inference passed on October 11, 2026. Production integration, quality evaluation, and ongoing quota availability remain pending. Ollama remains an alternative to evaluate.
- Weekly reports on Fridays at 18:00, America/Guayaquil.
- The human manager approves every Trello or code modification; other members initially have read-only access.
- Confirmed manager: Steven Eduardo Paredes Medina, Trello username andrewuzumaki, display name “andrew uzumaki”.
- Code corrections are prepared in branches and reviewed; humans perform final integration.
- dev-project-agent: development on develop; validated final release on main.
- UTAPED: approved corrections on agent/<proposal-id>-v<version>, PRs to develop; humans merge into develop and later main.
- English for filenames, code, code comments, logs, commits, PR metadata, README.md, and repository instructions. Spanish for application end-user content. Personal documentation inside docs/ may remain in Spanish by explicit user exception. Preserve source values and proper names.

## Documentation

- [Implementation status and provider validation](docs/implementation-status.md)
- [Trello reading and synchronization](docs/trello-integration.md)
- [Tracking rules and implementation limits](docs/tracking-rules.md)
- [Source supervision, baseline and history](docs/supervision.md)
- [AI provider validation](docs/provider-validation.md)
- [Renewable ChatGPT access](docs/renewable-access.md)
- [Weekly reports and printing](docs/weekly-reports.md)
- [Code review and simulated publication](docs/code-review.md)
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
- [First-release academic acceptance matrix](docs/academic-acceptance-matrix.md)
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

Trello checks: npm run test:trello-db. After migration, npm run trello:import imports the private docs/utaped-trello.json export; an optional file argument selects another local export. The dashboard distinguishes exports from live readings. Live synchronization requires TRELLO_API_KEY and TRELLO_TOKEN in the ignored .env, followed by a service restart. Generate a read-only token using the official Trello authorization flow described in docs/trello-integration.md. Never paste credentials into chat or commit them. Only the project manager can request a live sync; members can read saved snapshots. Controlled one-card due-date writes are separately gated, disabled by default, and require TRELLO_WRITES_ENABLED=true plus TRELLO_WRITE_TOKEN; the read token is not reused as a write credential. Do not enable real writes for demonstrations. See [controlled execution](docs/trello-execution.md).

Tracking settings are stored in PostgreSQL. The manager edits the due-soon window and stale-source threshold through “Configuración del seguimiento”; viewers can read them. Each save creates an audited version and immediately triggers reevaluation without restarting the service. Existing projects start with proposed values of 72 hours and 60 minutes, pending manager confirmation. See [tracking rules](docs/tracking-rules.md) for limits and API details.

The supervision panel provides persistent manual source-reading and analysis jobs, immutable analysis history, explicit baseline confirmation, Trello descriptions/WBS/checklists/dependencies, and GitHub branch/commit/change metadata pinned to revisions. The worker starts with the service and recovers expired leases with bounded attempts. No periodic source sync is enabled. GitHub reads the configured public UTAPED repository without credentials; an optional GITHUB_TOKEN may be configured locally. No source-code execution or real external write is enabled in the local environment.

Managers can connect ChatGPT through the dashboard, select an account-visible model and request a six-case synthetic evaluation. Use http://127.0.0.1:5174/ for the session-bound OAuth callback. Completed renewable credentials are encrypted with AES-256-GCM in PostgreSQL; the separate CHATGPT_CREDENTIAL_KEY is generated in the ignored .env by setup. Access renews near expiry, survives service restart and dashboard logout, and remains subject to current manager authority. Disconnect clears saved access and attempts remote revocation; the panel reports when remote revocation could not be confirmed. After upgrading from memory-only access, connect once to establish a renewable grant. Protect and retain the encryption key; do not replace it casually. See [renewal and recovery](docs/renewable-access.md). Interrupted evaluations are not replayed and passing them does not enable external changes. Check with npm run test:provider-db, npm run test:renewal-db and npm run test:ui.

Additional checks: npm run test:supervision-db, npm run test:executions-db, and npm run test:ui. The UI check uses Chromium and a temporary synthetic project on port 3133, rolls back its data, and saves screenshots under ignored work/ui/. Install its browser with npx playwright install chromium if needed. npm run sources:read performs an administrative read of the configured sources, stores snapshots and system audit, and never confirms a baseline. npm run ai:validate performs official interactive ChatGPT authorization and a small synthetic inference test; each run requires sign-in and tokens are not persisted. The first real inference passed; see [provider validation](docs/provider-validation.md) for evidence and scope.

## Local accounts

Run npm run user:create in an interactive terminal to create an account and its project membership. The first account defaults to manager; subsequent accounts default to viewer. Choose Steven's manager account explicitly. Password entry is masked, confirmation is required, and passwords must contain 15–128 characters. No default credentials or public registration endpoint exist. Administrative commands use the migration database role and must remain local.

Run npm run user:reset to change a password and revoke existing sessions. Password hashes use Argon2id. Sessions remain in PostgreSQL across service restarts, expire after 30 minutes of inactivity or eight hours from login, and use HttpOnly/SameSite cookies. Explicit loopback HTTP settings support local development; HTTPS configuration uses Secure cookies. Mutation endpoints require an allowed Origin and session CSRF token. Login is limited to ten attempts per minute per IP in this single-process version.

The manager can read project membership; viewers cannot. Permissions and account activity are checked against PostgreSQL on each protected request. Audit records include successful/denied logins, logout, account creation, password changes, and denied membership reads. See [authentication operations](docs/authentication.md).

The first version runs locally. Scheduled jobs require the computer and service to be active. No additional API or hosting budget is available.

## Proposal agents and manager decisions

The proposal panel runs Executor, Reviewer, and Approver sequentially through the connected ChatGPT account. The initial scope is one proposed Trello due-date change. Each version freezes its source context, validated content, SHA-256 fingerprint, stage messages, model/effort, usage, and human decision. Review and policy checks must succeed before manager approval. Adjustments create a new version and repeat all stages; rejection is terminal. Source, baseline, or tracking policy changes invalidate the candidate. Approval records authorization only; execution is a separate gated request. See [implemented workflow](docs/agent-workflow.md).

Use `npm run db:migrate` after updating. Run `npm run test:proposals-db` for rollback-based PostgreSQL workflow checks and `npm run test:ui` for the synthetic browser journey. Explicit reasoning levels are currently verified only for `gpt-6.1-sol`: low, medium, high, xhigh, max. Other models use the provider default until their supported levels are verified. The UI records the requested setting, not measured internal reasoning.

## Code review and correction milestone

The dashboard now reads bounded source files from exact GitHub commits, runs isolated syntax and pattern checks, and optionally requests evidence-grounded analysis through the existing ChatGPT connection. Sending code requires separate explicit consent. The sequential Executor, Reviewer and Approver prepare a bounded diff and immutable versions; the manager decides on its exact content hash. Failed or interrupted workflows resume only on explicit request, preserving completed stages.

GitHub publication is simulation-only. Approval records a demonstration, and the simulation records the planned `agent/<proposal-id>-v<version>` branch and PR destination without creating a remote commit, branch or PR. No merge capability or GitHub write adapter is implemented. Existing Trello write gates remain disabled locally; demonstrations cannot enable them. UTAPED builds and tests are not executed by this milestone. See [scope, API and evidence](docs/code-review.md).

Additional checks: `npm run test:code-db` runs rollback-based PostgreSQL integration tests; `npm run test:ui` exercises both workflows using synthetic external services. `npm run code:inspect` lists eligible files; append selected repository-relative paths to read and statically check them without saving analysis or invoking AI.

## Weekly reports

Run `npm run setup` and `npm run db:migrate` after upgrading, then restart `npm run dev` so the newly generated encryption key is loaded. In the manager dashboard, activate the weekly report schedule (Friday 18:00, America/Guayaquil by default) or generate a manual report. Day and time are configurable and versioned. The service creates reports without an open browser and recovers missed cutoffs with their original periods. It must remain running; no Windows startup task is installed.

Reports reuse identified evidence and code results with their original dates and limitations. Preparation, review and internal publication are explicitly deterministic; they do not consume ChatGPT or authorize external changes. Missing planning evidence leaves a draft. Corrections create another immutable version of the same period. Open the printable version and use browser printing to save A4 PDF. No messages are sent externally. Periodic source synchronization and daily AI analysis remain pending. See [report scope and API](docs/weekly-reports.md). Check with `npm run test:reports-db` and `npm run test:ui`.
