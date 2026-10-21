# Dev Project Agent

Local project supervision for a human manager: Trello planning, GitHub code review, sequential proposal agents, evidence-based reports and configurable manager email.

Version **1.1.0**. Independent Node.js/TypeScript/Fastify service, React/TypeScript dashboard and PostgreSQL. Development uses `develop`; promotion to `main`, tags and remote publication require the manager's release decision. Temporary defense materials are excluded.

Version 1.1 adds institutional reports with charts and frozen printable content, explicit responsibility-based email routing, execution feedback, guarded withdrawal/recovery and a conversational workspace. Read the [1.1 operator guide](docs/version-1.1-guide.md) and [validation limits](docs/validation/version-1.1-validation.md). New live recovery operations and natural-language model quality require their own acceptance; synthetic checks do not authorize real changes.

## Delivered scope

- Eight responsive dashboard sections, modern blue/neutral styling, light/dark themes, manager/viewer permissions and PostgreSQL-backed sessions.
- Read-only Trello/GitHub synchronization, immutable observations, configurable tracking rules, baselines, dependencies, delays and persistent alerts.
- Sequential Executor, Reviewer and Approver for bounded, versioned proposals. The manager decides on exact content; external execution requires separate confirmation and fresh checks. Demonstrations remain non-executable.
- Date, priority, member and state changes through separately gated Trello credentials; branch/draft-PR publication through separately gated GitHub credentials. No automatic merge.
- Recent-change analysis and **progressive repository coverage**: inventory, durable batches, large-file fragments, dependency context, pause/resume, bounded retries, change invalidation, exclusions and immutable evidence.
- Configurable source, code and report schedules; reports with historical cutoffs, coverage snapshots and institutional Letter-format printing.
- Consented SMTP notifications, selected events, daily digest, quiet hours, reminders and delivery history.
- ChatGPT as validated primary provider, with encrypted renewable access and model/effort selection. Ollama is optional: discover compatible installed models on the configured server and evaluate them. Connection does not establish quality. No automatic provider fallback.

The academic record closes **38 criteria as passed and one with historical exception EX-01**. This does not assert that every old record meets current policy or that the professor waived a criterion. See [acceptance](docs/validation/real-acceptance-validation.md), [closeout](docs/validation/validation-closeout.md) and [release verification](docs/validation/release-validation.md).

## Install and run

Requirements: Node.js **24.19.0 or later in 24.x**, npm **11.x**, Docker with Compose. Run from the repository root:

```sh
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run user:create
npm run build
npm start
```

Compiled dashboard/API: **http://127.0.0.1:3100/**; health: `/api/v1/health`. Set `APP_PUBLIC_URL=http://127.0.0.1:3100` in private `.env` for compiled-mode email links and retain that origin in `APP_ORIGINS`.

For development, use `npm run dev` instead of `npm start`: dashboard **5174**, API **3100**. Run only one service instance per database. Identify the existing project instance if a port is occupied; do not terminate unrelated processes.

Compose starts only PostgreSQL, on loopback **15434** with its own named volume. The service and workers form one application. Stop it with Ctrl+C; `npm run db:stop` preserves database data.

Setup preserves existing `.env` values and restricts access. Changing a database password in `.env` does not rotate an existing role. Do not delete the volume to repair credentials. There is no default user/password or public signup. `user:create` and `user:reset` are local administrative commands.

## Configure and operate

Use **Configuración** for integrations, tracking, automation, notifications, appearance and team. Follow the [operator guide](docs/first-release-guide.md).

- Sources use read credentials. Live writes require separate tokens and their explicit environment flags, exact manager approval and separate execution confirmation.
- Connect ChatGPT through the dashboard. Renewable credentials are encrypted in PostgreSQL with `CHATGPT_CREDENTIAL_KEY` from `.env`; retain that key. Quota, revocation and availability still apply.
- Configure Ollama with `OLLAMA_BASE_URL` on the server. Discovered compatible models have different quality, format support and resource needs. The agent does not download models or switch providers after failures.
- Configure SMTP using [.env.example](.env.example). Save the manager recipient, verify SMTP and request a test before enabling automatic mail. SMTP acceptance and inbox receipt are distinct.
- Open **Código → Cobertura del repositorio**. Prepare inventory, configure limits and optional AI consent, then start. Pause allows the current fragment to finish. Inspect partial results and exclusions before interpreting the percentage.

Fresh schedules, mail and writes start disabled. Existing installations retain saved settings. The browser may close, but the computer, PostgreSQL and service must stay active. No OS startup task or hosted 24/7 service is installed.

## Verify, back up and package

```sh
npm run verify
npm run verify:install
npm run verify:upgrade
npm run db:backup
```

`test:isolated` creates/migrates a disposable database, uses the runtime role for permission checks, runs synthetic unit/integration tests and removes only that test database. No test workers initialize against operational data. `test:coverage-db` narrows this runner to coverage. Regular `npm test` omits opt-in PostgreSQL cases; omissions are not passes. Test discovery excludes local work packages, backups and temporary directories through `vitest.config.ts`. Run `npm run docs:check` to verify local documentation links. `npm run verify` chains typecheck, `test:isolated`, `docs:check` and build.

`verify:install` starts compiled code on a free loopback port with another disposable database and no external credentials. It verifies dashboard delivery, health, authentication and safe defaults.

`db:backup` creates a **private** restricted-access directory under ignored `backups/`, containing a dump, recovery configuration and manifest, then tests restoration in a temporary database. Keep it separate from distributable artifacts. See [backup/recovery](docs/backup-and-recovery.md).

From a clean reviewed commit, `npm run release:package` builds a source/build ZIP with file hashes and SHA-256 under ignored `work/packages/`. Its Windows helper uses PowerShell/.NET ZIP support. It excludes credentials, operational state, sessions, raw exports, private evidence, node_modules and defense files. Packaging does not publish or merge anything.

## Limits

Coverage identifies checks over specific content. It does not guarantee defect-free code, execute repository scripts, compile Java, validate every dependency or navigate all screens. Fragmented files, incomplete context and unsupported syntax remain visibly partial. Truncated inventories do not replace a previous complete inventory. Corrections keep separate review/approval gates.

UTAPED is the configured and validated project. Generic identifiers and adapters prepare reuse; multi-organization SaaS, public hosting, ISO certification and exhaustive UTAPED functional validation are not claimed. Real Gemini/Groq and further Ollama quality evaluations remain deferred.

## Documentation

Start with the [current documentation index](docs/index.md). Original planning and experiments are preserved in the [historical archive](docs/archive/index.md).

- [Operator guide](docs/first-release-guide.md) · [Progressive coverage](docs/repository-coverage.md)
- [Backup/recovery](docs/backup-and-recovery.md) · [Release notes](docs/release-notes.md) · [Release verification](docs/validation/release-validation.md)
- [Architecture](docs/architecture.md) · [Requirements](docs/requirements.md) · [Business rules](docs/business-rules.md)
- [Academic matrix](docs/academic-acceptance-matrix.md) · [Real acceptance](docs/validation/real-acceptance-validation.md)
- [Providers](docs/agent-providers.md) · [Renewable access](docs/renewable-access.md)
- [Code review](docs/code-review.md) · [GitHub publication](docs/github-publication.md)
- [Trello execution](docs/trello-execution.md) · [Notifications](docs/notifications.md) · [Reports](docs/weekly-reports.md)
- [Git conventions](docs/git-conventions.md) · [Implementation history](docs/archive/validation/implementation-status.md)

Repository: https://github.com/Andriu-Dex/dev-project-agent. Supervised repository: https://github.com/Andriu-Dex/utaped. The local folder name `utaped-agent` does not need to change.
