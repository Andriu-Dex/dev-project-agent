import type {OllamaModel,OllamaOverview,ProviderCaseResult,ProviderEvaluation} from '@dev-project-agent/contracts';
import type {AuthUser} from '../../modules/auth/repository.js';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import {assertManager} from '../../modules/supervision/access.js';
import {caseInput,evaluationCases,evaluationInstructions,gradeCase,SUITE_VERSION} from '../chatgpt/evaluation.js';

export class OllamaError extends Error {
  constructor(readonly code:string,message?:string){
    super(message??`Ollama error: ${code}`);
  }
}

export interface OllamaOptions {
  database:TrelloDatabase;
  baseUrl?:string|undefined;
  fetcher?:typeof fetch|undefined;
  onFailure?:(()=>void)|undefined;
}

const selection=`SELECT e.id,e.provider,e.model,e.reasoning_effort AS "reasoningEffort",e.suite_version AS "suiteVersion",e.status,e.created_at AS "createdAt",e.finished_at AS "finishedAt",e.error_code AS "errorCode",r.result FROM provider_evaluations e LEFT JOIN provider_evaluation_results r ON r.evaluation_id=e.id AND r.project_id=e.project_id`;
const view=(row:ProviderEvaluation):ProviderEvaluation=>({...row,createdAt:new Date(row.createdAt).toISOString(),finishedAt:row.finishedAt?new Date(row.finishedAt).toISOString():null});

export class OllamaService {
  readonly baseUrl:string;
  private readonly fetcher:typeof fetch;
  private tasks=new Set<Promise<void>>();
  private closed=false;
  private readonly shutdown=new AbortController();

  constructor(readonly options:OllamaOptions) {
    const rawUrl=options.baseUrl??process.env.OLLAMA_BASE_URL??'http://127.0.0.1:11434';
    const parsed=new URL(rawUrl);
    if(!['http:','https:'].includes(parsed.protocol))throw new Error('Ollama URL must use http or https.');
    this.baseUrl=parsed.origin;
    this.fetcher=options.fetcher??fetch;
  }

  async initialize() {
    // Single local service recovery. Do not replay interrupted evaluations.
    await this.options.database.query(`WITH interrupted AS (UPDATE provider_evaluations SET status='interrupted',finished_at=clock_timestamp(),error_code='SERVICE_RESTARTED' WHERE status='running' AND provider='ollama' RETURNING id,project_id)
      INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) SELECT project_id,'system',NULL,'ollama.recovery','ollama',id::text,'failed' FROM interrupted`);
  }

  async audit(projectId:string,userId:string|null,action:string,outcome:string,resourceId:string) {
    await this.options.database.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,$2,$3,$4,'ollama',$5,$6)",[projectId,userId?'user':'system',userId,action,resourceId,outcome]);
  }

  async healthCheck():Promise<{status:'connected'|'unavailable';errorCode:string|null}> {
    try {
      const response=await this.fetcher(`${this.baseUrl}/api/tags`,{
        method:'GET',
        signal:AbortSignal.timeout(5_000),
      });
      if(response.ok)return {status:'connected',errorCode:null};
      return {status:'unavailable',errorCode:'OLLAMA_HTTP_ERROR'};
    } catch {
      return {status:'unavailable',errorCode:'OLLAMA_UNAVAILABLE'};
    }
  }

  async listModels():Promise<OllamaModel[]> {
    try {
      const response=await this.fetcher(`${this.baseUrl}/api/tags`,{
        method:'GET',
        signal:AbortSignal.timeout(10_000),
      });
      if(!response.ok)throw new OllamaError('OLLAMA_UNAVAILABLE');
      const data=await response.json() as {models?:Array<{name?:string;model?:string;digest?:string;size?:number;modified_at?:string;details?:{format?:string;family?:string;parameter_size?:string;quantization_level?:string}}>};
      const rawList=Array.isArray(data?.models)?data.models:[];
      return rawList.map(item=>({
        name:item.name??item.model??'unknown',
        digest:item.digest??'',
        size:item.size??0,
        modifiedAt:item.modified_at??'',
        details:item.details?{
          format:item.details.format,
          family:item.details.family,
          parameterSize:item.details.parameter_size,
          quantizationLevel:item.details.quantization_level,
        }:undefined,
      }));
    } catch(error) {
      if(error instanceof OllamaError)throw error;
      throw new OllamaError('OLLAMA_UNAVAILABLE');
    }
  }

  async generate(model:string,instructions:string,input:string,signal?:AbortSignal):Promise<{model:string;durationMs:number;usage:Record<string,number>|null;output:unknown}> {
    if(this.closed)throw new OllamaError('OLLAMA_UNAVAILABLE');
    if(!model||!/^[a-zA-Z0-9_.:/-]{1,120}$/.test(model))throw new OllamaError('INVALID_MODEL');
    const startedAt=Date.now();
    const timeout=AbortSignal.timeout(300_000);
    const requestSignal=AbortSignal.any([timeout,this.shutdown.signal,...(signal?[signal]:[])]);

    try {
      const response=await this.fetcher(`${this.baseUrl}/api/chat`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        signal:requestSignal,
        body:JSON.stringify({
          model,
          messages:[
            {role:'system',content:instructions},
            {role:'user',content:input},
          ],
          format:'json',
          stream:false,
          options:{
            temperature:0.1,
            num_ctx:8192,
          },
        }),
      });

      if(!response.ok) {
        if(response.status===404)throw new OllamaError('MODEL_NOT_AVAILABLE');
        throw new OllamaError('INFERENCE_FAILED');
      }

      if(!response.body)throw new OllamaError('INVALID_MODEL_OUTPUT');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
      try {
        while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>2_000_000){await reader.cancel();throw new OllamaError('RESPONSE_TOO_LARGE');}chunks.push(part.value);}
      }finally{reader.releaseLock();}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        message?:{content?:string};
        prompt_eval_count?:number;
        eval_count?:number;
      };

      const rawContent=body.message?.content?.trim();
      if(!rawContent)throw new OllamaError('INVALID_MODEL_OUTPUT');

      let parsed:unknown;
      try {
        parsed=JSON.parse(rawContent);
      } catch {
        throw new OllamaError('INVALID_MODEL_OUTPUT');
      }

      const usage={
        input_tokens:body.prompt_eval_count??0,
        output_tokens:body.eval_count??0,
        total_tokens:(body.prompt_eval_count??0)+(body.eval_count??0),
      };

      return {
        model,
        durationMs:Date.now()-startedAt,
        usage,
        output:parsed,
      };
    } catch(error) {
      if(this.shutdown.signal.aborted)throw new OllamaError('PROVIDER_UNAVAILABLE');
      if(signal?.aborted)throw new OllamaError('OPERATION_CANCELLED');
      if(timeout.aborted)throw new OllamaError('INFERENCE_TIMEOUT');
      if(error instanceof OllamaError)throw error;
      throw new OllamaError('INFERENCE_FAILED');
    }
  }

  async overview(projectId:string):Promise<OllamaOverview> {
    let models:OllamaModel[]=[];
    let status:'connected'|'unavailable'='unavailable';
    let errorCode:string|null=null;

    try {
      models=await this.listModels();
      status='connected';
    } catch(err) {
      status='unavailable';
      errorCode=err instanceof OllamaError?err.code:'OLLAMA_UNAVAILABLE';
    }

    const rows=await this.options.database.query<ProviderEvaluation>(
      selection+" WHERE e.project_id=$1 AND e.provider='ollama' ORDER BY e.created_at DESC,e.id DESC LIMIT 20",
      [projectId]
    );

    return {
      connection:{
        status,
        baseUrl:this.baseUrl,
        models,
        errorCode,
      },
      evaluations:rows.rows.map(view),
    };
  }

  async evaluate(projectId:string,actor:AuthUser,model:string,requestKey:string):Promise<ProviderEvaluation> {
    if(this.closed)throw new OllamaError('OLLAMA_UNAVAILABLE');
    const database=this.options.database;
    const client=await database.connect();
    let row:ProviderEvaluation;
    let created=false;

    try {
      await client.query('BEGIN');
      await assertManager(client,projectId,actor);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['provider-evaluation:'+projectId]);

      const previous=await client.query<ProviderEvaluation>(
        selection+' WHERE e.project_id=$1 AND e.requested_by=$2 AND e.request_key=$3',
        [projectId,actor.id,requestKey]
      );

      if(previous.rows[0]) {
        if(previous.rows[0].provider!=='ollama'||previous.rows[0].model!==model)throw new OllamaError('CONFLICT');
        row=previous.rows[0];
      } else {
        const active=await client.query("SELECT id FROM provider_evaluations WHERE project_id=$1 AND status='running'",[projectId]);
        if(active.rows.length)throw new OllamaError('CONFLICT');

        const inserted=await client.query<{id:string}>(
          "INSERT INTO provider_evaluations (project_id,requested_by,request_key,model,suite_version,status,reasoning_effort,provider) VALUES ($1,$2,$3,$4,$5,'running',NULL,'ollama') RETURNING id",
          [projectId,actor.id,requestKey,model,SUITE_VERSION]
        );
        row=(await client.query<ProviderEvaluation>(selection+' WHERE e.id=$1',[inserted.rows[0]!.id])).rows[0]!;
        await client.query("INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,'user',$2,'ollama.evaluate','ollama',$3,'requested')",[projectId,actor.id,row.id]);
        created=true;
      }
      await client.query('COMMIT');
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if(created) {
      const task=this.runEvaluation(projectId,actor,row!.id,model).catch(()=>{
        this.options.onFailure?.();
      });
      this.tasks.add(task);
      void task.then(()=>this.tasks.delete(task));
    }

    return view(row!);
  }

  private async runEvaluation(projectId:string,actor:AuthUser,id:string,model:string) {
    const cases:ProviderCaseResult[]=[];
    let errorCode:string|null=null;

    try {
      for(const test of evaluationCases) {
        await assertManager(this.options.database,projectId,actor);
        const response=await this.generate(model,evaluationInstructions,caseInput(test));
        await assertManager(this.options.database,projectId,actor);
        cases.push(gradeCase(test,response.output,response.durationMs,response.usage));
      }
    } catch(error) {
      errorCode=error instanceof OllamaError?error.code:'INFERENCE_FAILED';
    }

    const result={
      cases,
      passed:cases.filter(v=>v.passed).length,
      total:evaluationCases.length,
      requiresHumanReview:true as const,
      productionReady:false as const,
    };

    if(this.closed)errorCode='SERVICE_STOPPED';
    const status=this.closed?'interrupted':!errorCode&&cases.length===evaluationCases.length&&cases.every(v=>v.passed)?'passed':'failed';

    const client=await this.options.database.connect();
    try {
      await client.query('BEGIN');
      const updated=await client.query(
        "UPDATE provider_evaluations SET status=$2,finished_at=clock_timestamp(),error_code=$3 WHERE id=$1 AND status='running' RETURNING id",
        [id,status,errorCode]
      );
      if(updated.rows.length) {
        await client.query(
          'INSERT INTO provider_evaluation_results (evaluation_id,project_id,result) VALUES ($1,$2,$3)',
          [id,projectId,JSON.stringify(result)]
        );
        await client.query(
          "INSERT INTO audit_events (project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES ($1,'user',$2,'ollama.evaluate','ollama',$3,$4)",
          [projectId,actor.id,id,status==='passed'?'succeeded':'failed']
        );
      }
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      this.options.onFailure?.();
    } finally {
      client.release();
    }
  }

  async waitForIdle() {
    await Promise.allSettled(this.tasks);
  }

  async close() {
    this.closed=true;
    this.shutdown.abort();
    await this.waitForIdle();
  }
}
