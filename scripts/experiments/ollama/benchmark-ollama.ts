import {generationOptions,OLLAMA_TIMEOUT_MS} from '../../../apps/server/src/providers/ollama/generation.js';
import {createEvidenceDirectory,implementationManifest,inferenceManifest,writeEvidence,summarizeExecutions,digest} from './benchmark-support.js';
import {execSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {caseInput,evaluationCases,evaluationInstructions,gradeCase,SUITE_VERSION} from '../../../apps/server/src/providers/chatgpt/evaluation.js';

interface CliArgs {
  models:string[];
  repetitions:number;
  suite:string;
  outDir:string;
  temperature:number;
  seed?:number;
  numCtx:number;
  numPredict:number;
  format:'json'|'schema';
}

function parseArgs():CliArgs {
  const args=process.argv.slice(2);
  const get=(flag:string)=> {
    const idx=args.indexOf(flag);
    return idx>=0&&args[idx+1]?args[idx+1]:null;
  };

  const modelsStr=get('--models')??get('--model')??'qwen2.5-coder:7b,qwen3.5:4b,qwen3.5:9b';
  const models=modelsStr.split(',').map(s=>s.trim()).filter(Boolean);
  const repetitions=Number(get('--repetitions')??'5');
  const suite=get('--suite')??SUITE_VERSION;
  const runId=get('--run-id')??`phase1-baseline-${new Date().toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
  const outDir=get('--out')??`work/provider-validation/${runId}`;
  const temperature=Number(get('--temperature')??'0.1');
  const seedStr=get('--seed');
  const seed=seedStr?Number(seedStr):undefined;
  const numCtx=Number(get('--num-ctx')??8192),numPredict=Number(get('--num-predict')??2048);
  generationOptions({temperature,seed,numCtx,numPredict});
  if(!Number.isInteger(repetitions)||repetitions<1||repetitions>100)throw new Error('Repetitions must be between 1 and 100.');
  if(!models.length||models.some(model=>!/^[a-zA-Z0-9_.:/-]{1,120}$/.test(model)))throw new Error('Invalid model selection.');
  if(suite!==SUITE_VERSION)throw new Error('Unsupported suite for this benchmark.');
  const format=(get('--format')??'json') as 'json'|'schema';
  if(!['json','schema'].includes(format))throw new Error('Invalid output format.');

  return {models,repetitions,suite,outDir,temperature,...(seed!==undefined?{seed}:{}),numCtx,numPredict,format};
}

function getGpuMemory():{usedMiB:number;totalMiB:number}|null {
  try {
    const out=execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits',{encoding:'utf8'});
    const [used,total]=out.trim().split(',').map(v=>parseInt(v.trim(),10));
    return {usedMiB:used??0,totalMiB:total??0};
  } catch {
    return null;
  }
}

function getSystemMemory():{freeMB:number;totalMB:number}|null {
  try {
    const out=execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory) | ConvertTo-Json"',{encoding:'utf8'});
    const data=JSON.parse(out);
    return {
      freeMB:Math.round(data.FreePhysicalMemory/1024),
      totalMB:Math.round(data.TotalVisibleMemorySize/1024),
    };
  } catch {
    return null;
  }
}

function getGitRevision():string {
  try {
    return execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();
  } catch {
    return 'unknown';
  }
}

function getOllamaVersion(baseUrl:string):string {
  try {
    return execSync('ollama --version',{encoding:'utf8'}).trim();
  } catch {
    return 'unknown';
  }
}

async function listOllamaModels(baseUrl:string) {
  const res=await fetch(`${baseUrl}/api/tags`);
  if(!res.ok)throw new Error(`Failed to list Ollama tags at ${baseUrl}`);
  const data=await res.json() as {models?:Array<{name:string;digest:string;size:number;details?:any}>};
  return data.models??[];
}

// Structured schema for tracking case output
export const trackingCaseSchema={
  type:'object',
  properties:{
    caseId:{type:'string'},
    classification:{type:'string',enum:['overdue','completed','on_schedule','insufficient_data']},
    evidenceIds:{type:'array',items:{type:'string'}},
    requiresHumanApproval:{type:'boolean'},
    recommendation:{type:'string'},
    unknowns:{type:'array',items:{type:'string'}},
  },
  required:['caseId','classification','evidenceIds','requiresHumanApproval','recommendation','unknowns'],
};

export async function runBenchmark() {
  const args=parseArgs();
  const baseUrl=process.env.OLLAMA_BASE_URL??'http://127.0.0.1:11434';

  console.log(`=== Dev Project Agent: Ollama Benchmark Runner ===`);
  console.log(`Base URL:      ${baseUrl}`);
  console.log(`Models:        ${args.models.join(', ')}`);
  console.log(`Repetitions:   ${args.repetitions}`);
  console.log(`Suite:         ${args.suite}`);
  console.log(`Format:        ${args.format}`);
  console.log(`Output Dir:    ${args.outDir}`);
  console.log(`Temperature:   ${args.temperature}`);
  console.log(`Seed:          ${args.seed}`);

  await createEvidenceDirectory(args.outDir);

  const gitRev=getGitRevision();
  const ollamaVer=getOllamaVersion(baseUrl);
  const installedModels=await listOllamaModels(baseUrl);

  // Validate that all requested models exist
  for(const model of args.models) {
    const found=installedModels.find(m=>m.name===model);
    if(!found) {
      console.error(`ERROR: Model "${model}" is not installed in Ollama.`);
      console.error(`Installed models: ${installedModels.map(m=>m.name).join(', ')}`);
      process.exit(1);
    }
  }

  const runMetadata={
    runId:args.outDir.split(/[/\\]/).pop(),
    startedAt:new Date().toISOString(),
    gitRevision:gitRev,
    ollamaVersion:ollamaVer,
    environment:{
      os:'Windows 11',
      cpu:'Intel Core i7-13700H (14 cores, 20 threads)',
      systemMemory:getSystemMemory(),
      gpuMemory:getGpuMemory(),
    },
    config:args,
    inference:inferenceManifest(args),
    implementation:await implementationManifest(['apps/server/src/providers/ollama/generation.ts','apps/server/src/providers/ollama/service.ts','apps/server/src/providers/evaluation-v2.ts' , 'apps/server/src/providers/chatgpt/evaluation.ts','scripts/experiments/ollama/benchmark-support.ts','scripts/experiments/ollama/benchmark-ollama.ts']),
    instructionsSha256:digest(evaluationInstructions),
    graderVersion:'tracking-grader-v1',
    metricDefinition:'safetyViolations counts failed executions; failedSafetyChecks counts individual checks; neither proves external execution',
    installedModels:installedModels.filter(m=>args.models.includes(m.name)),
  };

  await writeEvidence(`${args.outDir}/run-metadata.json`,runMetadata);

  const modelSummaries:any[]=[];

  for(const model of args.models) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Starting benchmark for model: ${model}`);
    console.log(`--------------------------------------------------`);

    const modelInfo=installedModels.find(m=>m.name===model)!;
    const rawExecutions:any[]=[];
    const latencies:number[]=[];
    let coldStartDurationMs:number|null=null;
    let coldLoadDurationMs:number|null=null;

    const gpuBefore=getGpuMemory();
    const sysMemBefore=getSystemMemory();

    for(let rep=1;rep<=args.repetitions;rep++) {
      console.log(`  Repetition ${rep}/${args.repetitions} ...`);

      for(const test of evaluationCases) {
        const isFirstCall=(rep===1&&test.id===evaluationCases[0]!.id);
        const started=Date.now();
        const inputStr=caseInput(test);

        const requestBody:any={
          model,
          messages:[
            {role:'system',content:evaluationInstructions},
            {role:'user',content:inputStr},
          ],
          stream:false,
          options:generationOptions(args),
        };

        if(args.format==='schema') {
          requestBody.format=trackingCaseSchema;
        } else {
          requestBody.format='json';
        }

        let responseBody:any=null;
        let fetchError:string|null=null;
        let durationMs=0;

        try {
          const res=await fetch(`${baseUrl}/api/chat`,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(requestBody),
            signal:AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
          });

          if(!res.ok) {
            fetchError=`HTTP_${res.status}`;
          } else {
            responseBody=await res.json();
          }
          durationMs=Date.now()-started;
        } catch(err:any) {
          durationMs=Date.now()-started;
          fetchError=err.name==='TimeoutError'?'TIMEOUT':err.message;
        }

        latencies.push(durationMs);

        if(isFirstCall) {
          coldStartDurationMs=durationMs;
          if(responseBody?.load_duration) {
            coldLoadDurationMs=Math.round(responseBody.load_duration/1_000_000);
          }
        }

        let parsedOutput:any=null;
        let parseError:string|null=null;

        if(responseBody?.message?.content) {
          try {
            parsedOutput=JSON.parse(responseBody.message.content.trim());
          } catch(err:any) {
            parseError='INVALID_JSON';
          }
        }

        const usage=responseBody?{
          prompt_tokens:responseBody.prompt_eval_count??0,
          eval_tokens:responseBody.eval_count??0,
          total_tokens:(responseBody.prompt_eval_count??0)+(responseBody.eval_count??0),
        }:null;

        const graded=gradeCase(test,parsedOutput,durationMs,usage as any);

        rawExecutions.push({
          request:requestBody,
          providerResponse:responseBody,
          repetition:rep,
          caseId:test.id,
          title:test.title,
          isColdStart:isFirstCall,
          durationMs,
          loadDurationMs:responseBody?.load_duration?Math.round(responseBody.load_duration/1_000_000):null,
          evalDurationMs:responseBody?.eval_duration?Math.round(responseBody.eval_duration/1_000_000):null,
          evalCount:responseBody?.eval_count??0,
          promptEvalCount:responseBody?.prompt_eval_count??0,
          thinking:responseBody?.message?.thinking??null,
          fetchError,
          parseError,
          output:parsedOutput,
          checks:graded.checks,
          passed:graded.passed,
          errorCode:graded.errorCode??fetchError,
        });
      }
    }

    const gpuAfter=getGpuMemory();
    const sysMemAfter=getSystemMemory();

    // Compute stats
    const sortedAll=[...latencies].sort((a,b)=>a-b);
    const minLatency=sortedAll[0]??0;
    const maxLatency=sortedAll[sortedAll.length-1]??0;
    const medianLatency=sortedAll[Math.floor(sortedAll.length/2)]??0;
    const avgLatency=Math.round(sortedAll.reduce((a,b)=>a+b,0)/sortedAll.length);

    const recomputed=summarizeExecutions(rawExecutions);
    const summary={
      ...recomputed,
      inference:inferenceManifest(args),
      model,
      digest:modelInfo.digest,
      sizeBytes:modelInfo.size,
      details:modelInfo.details,
      suite:args.suite,
      format:args.format,
      repetitions:args.repetitions,

      casePassRate:parseFloat(((recomputed.passedCases/recomputed.totalExecutions)*100).toFixed(2)),

      checkPassRate:parseFloat(((recomputed.passedChecks/recomputed.totalChecks)*100).toFixed(2)),
      caseBreakdown:evaluationCases.map(test=>{
        const testRuns=rawExecutions.filter(r=>r.caseId===test.id);
        const testPassed=testRuns.filter(r=>r.passed).length;
        return {
          caseId:test.id,
          title:test.title,
          passed:testPassed,
          total:testRuns.length,
          passRate:parseFloat(((testPassed/testRuns.length)*100).toFixed(2)),
          failedChecks:testRuns.flatMap(r=>r.checks.filter((c:any)=>!c.passed).map((c:any)=>c.code)),
        };
      }),
      latencyMs:{
        min:minLatency,
        median:medianLatency,
        max:maxLatency,
        mean:avgLatency,
        warmMedian:recomputed.warmMedian,
        coldStartTotal:coldStartDurationMs,
        coldModelLoad:coldLoadDurationMs,
      },
      memory:{
        gpuBefore,
        gpuAfter,
        sysMemBefore,
        sysMemAfter,
      },
    };

    console.log(`  Model ${model} completed:`);
    console.log(`    Case Pass Rate:  ${summary.casePassRate}% (${recomputed.passedCases}/${recomputed.totalExecutions})`);
    console.log(`    Check Pass Rate: ${summary.checkPassRate}% (${recomputed.passedChecks}/${recomputed.totalChecks})`);
    console.log(`    Median Latency:  ${medianLatency} ms (warm: ${recomputed.warmMedian} ms, max: ${maxLatency} ms)`);
    console.log(`    Cold load:       ${coldLoadDurationMs ?? 'n/a'} ms`);

    const sanitizedModelName=model.replace(/[^a-zA-Z0-9.-]/g,'_');
    await writeEvidence(`${args.outDir}/model-${sanitizedModelName}-raw.json`,rawExecutions);
    await writeEvidence(`${args.outDir}/model-${sanitizedModelName}-summary.json`,summary);

    modelSummaries.push(summary);
  }

  const benchmarkSummary={
    suite:args.suite,
    format:args.format,
    repetitions:args.repetitions,
    totalExecutionsAcrossModels:modelSummaries.reduce((acc,s)=>acc+s.totalExecutions,0),
    models:modelSummaries,
  };

  await writeEvidence(`${args.outDir}/benchmark-summary.json`,benchmarkSummary);
  console.log(`\n=== Benchmark completed! Evidence saved to: ${args.outDir} ===\n`);

  return benchmarkSummary;
}

// Direct execution via tsx / node
if(import.meta.url===`file:///${process.argv[1]?.replace(/\\/g,'/')}`) {
  runBenchmark().catch(err=>{
    console.error('Benchmark failed:',err);
    process.exit(1);
  });
}
