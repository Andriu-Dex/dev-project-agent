# UTAPED Agent

Assistant for the UTAPED project manager: planning supervision, Trello integration, delay detection, weekly reporting, and code review through three specialized agents.

## Status

Initial planning as of October 7, 2026. Academic deadline: November 4, 2026. Four team members. Development has not started; no dependencies or connections have been configured.

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
- utaped-agent: development on develop; validated final release on main.
- UTAPED: approved corrections on agent/<proposal-id>-v<version>, PRs to develop; humans merge into develop and later main.
- English for filenames, code, code comments, logs, commits, PR metadata, README.md, and repository instructions. Spanish for application end-user content. Personal documentation inside docs/ may remain in Spanish by explicit user exception. Preserve source values and proper names.

## Documentation

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

The initial commit contains planning and Git configuration only. Both main and develop share this documentary foundation; current work continues on develop. No push is included.

.editorconfig, .gitattributes, .gitignore, and AGENTS.md define repository conventions. The private docs/utaped-trello.json export remains local and ignored because it contains profiles, history, and links. Dependency lockfiles will be tracked when implementation begins. There are no manifests, dependencies, credentials, or executable application configuration yet.

The first version runs locally. Scheduled jobs require the computer and service to be active. No additional API or hosting budget is available.
