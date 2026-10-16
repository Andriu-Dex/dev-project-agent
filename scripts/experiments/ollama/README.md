# Optional Ollama experiments

These diagnostics support later model evaluations. They are not imported by the production server and do not run during a normal build or unit-test run; `benchmark-support.test.ts` is the exception and remains an ordinary synthetic unit test.

Run commands from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run ollama:benchmark` | Base synthetic benchmark. |
| `npm run ollama:benchmark-v2` | Expanded evaluation and holdouts. |
| `npm run ollama:audit-evidence` | Audit recorded local benchmark evidence. |
| `npm run workflow:real` | Explicit real-model proposal workflow diagnostic. |

`test-code-workflow.ts` exports a real-model code workflow diagnostic referenced by the historical evaluation report. Preserve its explicit invocation requirements; it is not an automatic acceptance suite.

Real-model diagnostics require the configured Ollama service and, where applicable, a deliberately selected diagnostic database. They may consume substantial local resources and generate evidence under ignored `work/`; do not run them merely to verify a file move. No model is downloaded or accepted as production-ready by this directory's presence.

See the [historical report](../../../docs/archive/experiments/ollama-improvement-report.md) and [current provider policy](../../../docs/agent-providers.md).
