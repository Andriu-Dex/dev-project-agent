import pg from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {buildApp} from '../../../apps/server/src/app.js';
import {hashPassword} from '../../../apps/server/src/modules/auth/password.js';
import type {AuthUser} from '../../../apps/server/src/modules/auth/repository.js';
import type {TrelloDatabase} from '../../../apps/server/src/integrations/trello/service.js';
import {boardFixture,boardId,listId} from '../../../apps/server/src/integrations/trello/fixtures.js';
import {claimJob,enqueueJob,getJob} from '../../../apps/server/src/modules/supervision/jobs.js';
import {executeJob,type SupervisionOptions} from '../../../apps/server/src/modules/supervision/worker.js';
import {ChatGPTService} from '../../../apps/server/src/providers/chatgpt/service.js';
import {OllamaService} from '../../../apps/server/src/providers/ollama/service.js';
import {AgentProviders} from '../../../apps/server/src/providers/agents.js';
import type {ConnectionBinding} from '../../../apps/server/src/providers/chatgpt/connection.js';
import {ProposalService} from '../../../apps/server/src/modules/proposals/service.js';

export async function runRealAgentWorkflow(modelName = 'qwen2.5-coder:7b') {
  console.log(`\n=== Testing Real Agent Workflow with Model: ${modelName} ===\n`);

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
        if (sql.startsWith('BEGIN')) return query('SAVEPOINT workflow_test');
        if (sql === 'COMMIT') return query('RELEASE SAVEPOINT workflow_test');
        if (sql === 'ROLLBACK') {
          await query('ROLLBACK TO SAVEPOINT workflow_test');
          return query('RELEASE SAVEPOINT workflow_test');
        }
        return query(sql, values);
      },
      release: () => {},
    }),
  } as unknown as TrelloDatabase;

  const board = boardFixture();
  const loginName = 'wf-' + randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');
  let actor: AuthUser = null as any;

  try {
    const projectId = (await client.query("INSERT INTO projects (name) VALUES ('Real Agent Workflow Test') RETURNING id")).rows[0].id;
    await client.query('INSERT INTO trello_connections (project_id,board_id,operational_list_ids) VALUES ($1,$2,$3)', [projectId, boardId, JSON.stringify([listId])]);
    await client.query('INSERT INTO tracking_policy_versions (project_id,version,due_soon_hours,stale_after_minutes,confirmed) VALUES ($1,1,72,60,false)', [projectId]);

    const passwordHash = await hashPassword(password);
    const user = (await client.query<AuthUser>('INSERT INTO users (login,display_name,password_hash) VALUES ($1,$2,$3) RETURNING *', [loginName, 'Manager', passwordHash])).rows[0]!;
    await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)', [projectId, user.id, 'manager']);
    actor = user;

    // Synthetic trello source fetcher
    const sourceFetcher: typeof fetch = async (input, request) => {
      const url = new URL(String(input));
      return Response.json(url.pathname.endsWith('/lists') ? board.lists : url.pathname.endsWith('/members') ? board.members : url.pathname.endsWith('/cards') ? board.cards : url.pathname.endsWith('/checklists') ? [] : board);
    };

    const options: SupervisionOptions = {
      database,
      trelloCredentials: { key: 'k'.repeat(32), token: 't'.repeat(64) },
      githubToken: null,
      fetcher: sourceFetcher,
    };

    // Run trello_sync and analysis jobs to establish real snapshot context
    const syncJob = await enqueueJob(database, projectId, actor, 'trello_sync', randomUUID());
    await executeJob(options, (await claimJob(database, projectId))!);
    const analysisJob = await enqueueJob(database, projectId, actor, 'analysis', randomUUID());
    await executeJob(options, (await claimJob(database, projectId))!);
    const runId = (await getJob(client, projectId, analysisJob.id))!.job.runId!;

    console.log(`Initialized test project: ${projectId}, Snapshot runId: ${runId}`);

    // Set up providers
    const chatgpt = new ChatGPTService({ database, callbackOrigin: 'http://127.0.0.1:3100' });
    const ollama = new OllamaService({ database, baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434' });
    const router = new AgentProviders(chatgpt, ollama);

    const binding: ConnectionBinding = {
      projectId,
      userId: actor.id,
      authVersion: actor.auth_version,
      sessionId: 'real-agent-workflow-session',
    };

    const service = new ProposalService(database, router);
    // Fresh, rolled-back fixtures have no interrupted jobs to recover.
    // Global startup recovery must never touch other projects during a benchmark.

    const targetDue = new Date(Date.now() + 7 * 86400_000).toISOString();
    const proposalPayload = {
      sourceRunId: runId,
      cardId: board.cards[0]!.id,
      requestedDue: targetDue,
      goal: 'Reprogramar actividad atrasada por falta de insumos de desarrollo.',
      model: `ollama:${modelName}`,
      requestKey: randomUUID(),
    };

    console.log(`Launching Proposal preparation with model: ollama:${modelName}...`);
    const startTime = Date.now();
    const job = await service.prepare(binding, actor, proposalPayload);
    await service.waitForIdle();
    const duration = Date.now() - startTime;

    console.log(`Proposal preparation finished in ${duration} ms (Job ID: ${job.id}, Proposal ID: ${job.proposalId})`);

    const versionDetail = await service.version(projectId, job.proposalId, 1);
    if (!versionDetail) {
      throw new Error('Version detail was not created.');
    }

    console.log(`Proposal State: ${versionDetail.state}`);
    console.log(`Content Hash:   ${versionDetail.contentHash}`);
    console.log(`Messages count: ${versionDetail.messages.length}`);

    for (const msg of versionDetail.messages) {
      console.log(`  Stage [${msg.stage}]: status=${msg.status}, duration=${msg.durationMs}ms`);
      if (msg.errorCode) {
        console.log(`    Error: ${msg.errorCode}`);
      }
    }

    if (versionDetail.content) {
      console.log(`  Executor Content summary:`);
      console.log(`    Objective: ${versionDetail.content.objective.slice(0, 80)}...`);
      console.log(`    Justification: ${versionDetail.content.justification.slice(0, 80)}...`);
      console.log(`    Actions: ${JSON.stringify(versionDetail.content.actions)}`);
    }

    // Check if it reached pending_human_approval
    if (versionDetail.state === 'pending_human_approval') {
      console.log(`\nProposal successfully validated through Executor -> Reviewer -> Approver!`);
      console.log(`[TEST HARNESS SIMULATION]: Executing service.decide to simulate Human Manager approval...`);

      const decisionKey = randomUUID();
      const decision = await service.decide(
        projectId,
        actor,
        job.proposalId,
        1,
        versionDetail.contentHash!,
        'approved',
        '[SIMULACIÓN AUTOMATIZADA DE PRUEBA] Aprobado programáticamente en fixture (sin intervención humana manual).',
        decisionKey
      );

      console.log(`Decision outcome: state=${decision.state}, decisionId=${decision.decisionId}`);
      console.log(`Simulated manager authorization gate verified! (External change not executed)`);
    } else {
      console.log(`Note: Proposal stopped at state: ${versionDetail.state}`);
    }

    await service.close();
    await ollama.close();
    await chatgpt.close();

    return {
      success: versionDetail.state === 'pending_human_approval' || versionDetail.state === 'authorized',
      proposalId: job.proposalId,
      finalState: versionDetail.state,
      durationMs: duration,
      messages: versionDetail.messages,
    };
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const model = process.argv[2] ?? 'qwen2.5-coder:7b';
  runRealAgentWorkflow(model).then(res => {
    console.log('\nWorkflow Test Result:', JSON.stringify(res, null, 2));
    process.exit(res.success ? 0 : 1);
  }).catch(err => {
    console.error('Workflow Test Failed:', err);
    process.exit(1);
  });
}
