import pg from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from '../../../apps/server/src/modules/auth/password.js';
import type {AuthUser} from '../../../apps/server/src/modules/auth/repository.js';
import type {TrelloDatabase} from '../../../apps/server/src/integrations/trello/service.js';
import {ChatGPTService} from '../../../apps/server/src/providers/chatgpt/service.js';
import {OllamaService} from '../../../apps/server/src/providers/ollama/service.js';
import {AgentProviders} from '../../../apps/server/src/providers/agents.js';
import type {ConnectionBinding} from '../../../apps/server/src/providers/chatgpt/connection.js';
import {CodeReviewService} from '../../../apps/server/src/modules/code-review/service.js';
import {codeSourceFetcher,syntheticHead} from '../../../apps/server/src/modules/code-review/fixtures.js';

export async function runRealCodeWorkflow(modelName = 'qwen3.5:4b') {
  console.log(`\n=== Testing Real Code Review Workflow with Model: ${modelName} ===\n`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  await client.query('BEGIN');

  let queue: Promise<void> = Promise.resolve();
  const query = (sql: string, values?: unknown[]) => {
    const result = queue.then(() => client.query(sql, values));
    queue = result.then(() => {}, () => {});
    return result;
  };

  const database = {
    query,
    connect: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        if (sql.startsWith('BEGIN')) return query('SAVEPOINT code_wf_test');
        if (sql === 'COMMIT') return query('RELEASE SAVEPOINT code_wf_test');
        if (sql === 'ROLLBACK') {
          await query('ROLLBACK TO SAVEPOINT code_wf_test');
          return query('RELEASE SAVEPOINT code_wf_test');
        }
        return query(sql, values);
      },
      release: () => {},
    }),
  } as unknown as TrelloDatabase;

  const loginName = 'code-wf-' + randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');

  try {
    const projectId = (await client.query("INSERT INTO projects (name) VALUES ('Real Code Workflow Test') RETURNING id")).rows[0].id;
    await client.query('INSERT INTO github_connections (project_id,owner,repository,branch) VALUES ($1,$2,$3,$4)', [projectId, 'example', 'project', 'develop']);

    const passwordHash = await hashPassword(password);
    const user = (await client.query<AuthUser>('INSERT INTO users (login,display_name,password_hash) VALUES ($1,$2,$3) RETURNING *', [loginName, 'Manager', passwordHash])).rows[0]!;
    await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)', [projectId, user.id, 'manager']);

    const chatgpt = new ChatGPTService({ database, callbackOrigin: 'http://127.0.0.1:3100' });
    const ollama = new OllamaService({ database, baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434' });
    const router = new AgentProviders(chatgpt, ollama);

    const binding: ConnectionBinding = {
      projectId,
      userId: user.id,
      authVersion: user.auth_version,
      sessionId: 'real-code-workflow-session',
    };

    const service = new CodeReviewService(database, router, null, codeSourceFetcher);
    // Fresh, rolled-back fixtures have no interrupted jobs to recover.
    // Global startup recovery must never touch other projects during a benchmark.

    console.log(`Initialized test project: ${projectId}`);

    // Step 1: Run AI analysis
    console.log(`Running Code Analysis with model: ollama:${modelName}...`);
    const analysisReq = {
      paths: ['src/parse.ts'],
      expectedHead: syntheticHead,
      mode: 'files' as const,
      withAi: true,
      consent: true,
      model: `ollama:${modelName}`,
      requestKey: randomUUID(),
    };

    const analysisStartTime = Date.now();
    const { id: analysisId } = await service.analyze(binding, user, analysisReq);
    await service.waitForIdle();
    const analysisDuration = Date.now() - analysisStartTime;

    const analysisResult = await service.analysis(projectId, analysisId);
    console.log(`Analysis completed in ${analysisDuration} ms (Status: ${analysisResult?.status}, Error: ${analysisResult?.errorCode})`);

    if (analysisResult?.status !== 'ready' || !analysisResult.result) {
      throw new Error(`Analysis did not complete with ready status: ${analysisResult?.errorCode}`);
    }

    console.log(`Analysis findings count: ${analysisResult.result.findings.length}`);
    for (const f of analysisResult.result.findings) {
      console.log(`  Finding [${f.id}]: ${f.category} (${f.severity}) - ${f.title}`);
    }

    const findingIds = analysisResult.result.findings.slice(0, 1).map(f => f.id);
    if (!findingIds.length) {
      console.log('No findings to correct.');
      return { success: false, reason: 'NO_FINDINGS' };
    }

    // Step 2: Prepare correction with AI
    console.log(`\nLaunching Code Correction preparation with model: ollama:${modelName}...`);
    const correctionStartTime = Date.now();
    const correctionReq = {
      analysisId,
      findingIds,
      goal: 'Usar un formato JSON limitado y evitar la interpretacion dinamica.',
      model: `ollama:${modelName}`,
      consent: true,
      requestKey: randomUUID(),
    };

    const prepResult = await service.prepare(binding, user, correctionReq);
    await service.waitForIdle();
    const prepDuration = Date.now() - correctionStartTime;

    console.log(`Correction preparation finished in ${prepDuration} ms (Job ID: ${prepResult.id}, Proposal ID: ${prepResult.proposalId})`);

    const versionDetail = await service.version(projectId, prepResult.proposalId, prepResult.version);
    console.log(`Proposal State: ${versionDetail.state}`);
    console.log(`Candidate present: ${Boolean(versionDetail.candidate)}`);
    console.log(`Content Hash:   ${versionDetail.contentHash}`);
    console.log(`Messages count: ${versionDetail.messages.length}`);

    for (const msg of versionDetail.messages) {
      console.log(`  Stage [${msg.stage}]: status=${msg.status}, duration=${msg.durationMs}ms`);
      if (msg.errorCode) {
        console.log(`    Error: ${msg.errorCode}`);
      }
    }

    if (versionDetail.candidate) {
      console.log(`Candidate edits count: ${versionDetail.candidate.correction.edits.length}`);
      console.log(`Candidate checks: ${JSON.stringify(versionDetail.candidate.checks)}`);
    }

    await service.close();
    await ollama.close();
    await chatgpt.close();

    return {
      success: versionDetail.state === 'pending_human_approval',
      finalState: versionDetail.state,
      analysisDuration,
      prepDuration,
      findingsCount: analysisResult.result.findings.length,
      messages: versionDetail.messages,
    };
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const model = process.argv[2] ?? 'qwen3.5:4b';
  runRealCodeWorkflow(model).then(res => {
    console.log('\nCode Workflow Test Result:', JSON.stringify(res, null, 2));
    process.exit(res.success ? 0 : 1);
  }).catch(err => {
    console.error('Code Workflow Test Failed:', err);
    process.exit(1);
  });
}
