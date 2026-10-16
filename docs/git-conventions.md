# Git conventions

## Language

All commit subjects and bodies, branch names, pull request titles/descriptions, filenames, code, code comments, and logs must be in English. Application end-user content is in Spanish. By explicit user exception, personal planning and report documentation inside docs/ may remain in Spanish, with English filenames, technical identifiers, and commit examples. Preserve proper names, original source data, and exact end-user copy.

## Commit messages

Use type(scope): description, with an optional scope and a concise English imperative description. This is a team convention; no validators or hooks are installed during planning.

| Type | Purpose |
| --- | --- |
| feat | New functionality |
| fix | Defect correction |
| docs | Documentation |
| refactor | Restructuring without functional changes |
| test | Tests |
| build | Dependencies and build configuration |
| ci | Continuous integration automation |
| chore | Repository maintenance and configuration |
| style | Code formatting without functional changes |

Suggested scopes: trello, github, agents, proposals, reports, auth, db, web, planning. A scope is optional for general changes.

Examples:

- docs(planning): define initial agent planning
- feat(trello): track changes between board snapshots
- fix(proposals): prevent execution of invalidated versions
- test(auth): verify viewer permissions

Each commit contains one coherent, reviewable change. Avoid vague subjects such as “changes”, “progress”, or “final”. Add a body when motivation, validation, or limitations need explanation. Never include secrets, private exports, or automatic attribution.

For incompatible changes, place ! after the type/scope and explain the change and consumer migration in the body. This convention does not introduce package publishing or automated versioning.

## Branches and integration

- dev-project-agent: develop for development and main for a validated release. Both may contain the initial documentation baseline, which does not represent a finished application. Subsequent development happens on develop or working branches merged into develop.
- Supervised UTAPED: agent/<proposal-id>-v<version>, PR to develop, specific human approval required. Humans merge into develop and later main.

The initial commit groups planning and minimum Git configuration as a single foundation without implementation. No push is included.

Before committing, review included files and differences, check exclusions, and run checks appropriate to the change. Before promoting develop to main, review requirements, tests, and documented limitations.
