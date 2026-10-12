import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import pg from 'pg';
import { buildApp } from './app.js';
import { authConfigFromEnvironment } from './modules/auth/config.js';
import { credentialsFromEnvironment } from './integrations/trello/client.js';
import { githubToken } from './integrations/github/client.js';
import { startSupervisionWorker } from './modules/supervision/worker.js';
import { ChatGPTService } from './providers/chatgpt/service.js';
import {ExecutionService} from './modules/proposals/execution.js';
import {executionConfiguration,trelloExecutionRemote} from './integrations/trello/execution-client.js';
import {CodeReviewService} from './modules/code-review/service.js';
import { ProposalService } from './modules/proposals/service.js';
import {credentialKey} from './providers/chatgpt/vault.js';
import {ReportService,startReportWorker} from './modules/reports/service.js';
import {OperationService,startOperationWorker} from './modules/operations/service.js';

const connectionString = process.env.APP_DATABASE_URL;
if (!connectionString) throw new Error('APP_DATABASE_URL is required. Run npm run setup first.');
const port = Number(process.env.PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer between 1024 and 65535.');

const pool = new pg.Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
  statement_timeout: 3000,
  application_name: 'dev-project-agent',
});
const supervision={database:pool,trelloCredentials:credentialsFromEnvironment(process.env),githubToken:githubToken(process.env)};
const chatgpt=new ChatGPTService({database:pool,callbackOrigin:`http://127.0.0.1:${port}`,credentialKey:credentialKey(process.env.CHATGPT_CREDENTIAL_KEY??''),onFailure:()=>app.log.error('Provider operation could not persist its result.')});
const reports=new ReportService(pool);
const proposals=new ProposalService(pool,chatgpt,()=>app.log.error('Agent workflow could not publish its result.'));
const writeConfig=executionConfiguration(process.env);
const executions=new ExecutionService(pool,{enabled:writeConfig.enabled,remote:writeConfig.credentials?trelloExecutionRemote(writeConfig.credentials):null,onFailure:()=>app.log.error('Execution result could not be persisted. Reconciliation is required before any further write.')});
const codeReview=new CodeReviewService(pool,chatgpt,supervision.githubToken,fetch,()=>app.log.error('Code review could not persist its result.'));
const operations=new OperationService(pool,supervision,codeReview);
const app = buildApp({
  checkDatabase: async () => { await pool.query('SELECT 1'); },
  logger: true,
  auth: { ...authConfigFromEnvironment(process.env), database: pool, trello: { database: pool, credentials: supervision.trelloCredentials },supervision,chatgpt,proposals,executions,codeReview,reports,operations },
});
pool.on('error', () => { app.log.error('Idle database connection failed.'); });
let worker:ReturnType<typeof startSupervisionWorker>|undefined;
let reportWorker:ReturnType<typeof startReportWorker>|undefined;
let operationWorker:ReturnType<typeof startOperationWorker>|undefined;
app.addHook('onClose', async () => {await operationWorker?.close();await reportWorker?.close();await chatgpt.close();await proposals.close();await executions.close();await codeReview.close();await worker?.close();await pool.end(); });

const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
try {
  await chatgpt.initialize();
  await proposals.initialize();
  await executions.initialize();
  await codeReview.initialize();
  await app.listen({ host: '127.0.0.1', port });
  worker=startSupervisionWorker(supervision,()=>app.log.error('Supervision worker could not access storage.'));
  reportWorker=startReportWorker(reports,()=>app.log.error('Report worker could not access storage.'));
  operationWorker=startOperationWorker(operations,()=>app.log.error('Operation worker could not access storage.'));
} catch {
  app.log.error('Server startup failed.');
  await app.close();
  process.exitCode = 1;
}
