# Maintenance tools

Run npm commands from the repository root. Routine commands remain in `package.json`; moving optional experiments does not rename those commands.

## Local operation

- `setup`, `db:up`, `db:migrate`, `build`, `start` and `dev`: configuration, database and application lifecycle.
- `user:create`, `user:reset`: local account administration.
- `db:backup`: private backup plus restoration verification.
- `release:package`: source/build archive from a clean reviewed commit; never publishes or merges.

## Verification

- `typecheck`, `test`, `test:isolated`, `test:coverage-db` `verify:install` and `verify:upgrade` are the regular verification entry points.
- `test` retains all tracked unit tests, including benchmark-support tests, while excluding local working directories and package copies.
- Prefer `test:isolated` for PostgreSQL workflows: it provisions a disposable database and removes external credentials from test processes. Individual `test:*-db` wrappers remain available for controlled diagnostic environments; several services recover in-progress jobs when initialized, so do not run those wrappers against operational data casually.
- `test:ui` is a synthetic browser workflow and needs its documented local prerequisites.

## Optional source/provider diagnostics

`trello:import` and `sources:read` perform explicit local imports or source readings. `code:inspect` reads bounded GitHub code. `ai:validate` performs interactive ChatGPT authorization/inference; `ollama:validate` queries the configured Ollama service. These are opt-in operations, not part of an ordinary build or unit-test run.

Ollama benchmarking and real-model workflow diagnostics are grouped under [experiments/ollama](experiments/ollama/README.md). No executable tool was removed solely because its provider is optional.

`verify:upgrade` creates a disposable 1.0 schema, preserves synthetic report/configuration fixtures, applies the new migrations and checks immutable-content permissions. It never migrates the operational database.
