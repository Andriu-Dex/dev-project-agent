import type {ReasoningEffort} from '@dev-project-agent/contracts';
import type {AuthUser} from '../modules/auth/repository.js';
import {assertManager} from '../modules/supervision/access.js';
import type {ConnectionBinding} from './chatgpt/connection.js';
import {ChatGPTService} from './chatgpt/service.js';
import {ProviderValidationError} from './chatgpt/validation.js';
import {OllamaService,OllamaError} from './ollama/service.js';

// Existing model identifiers remain ChatGPT; local choices are explicitly namespaced
// so jobs, messages and scheduled configurations retain their original destination.
export const localModel=(model:string)=>model.startsWith('ollama:')?model.slice(7):null;
export interface AgentGenerateOptions {
  schema?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
}
export interface AgentProvider {
  ensureConnection(binding:ConnectionBinding,model?:string):Promise<void>;
  connections:{credentials(binding:ConnectionBinding,model:string):{entry:object}};
  generate(binding:ConnectionBinding,actor:AuthUser,model:string,effort:ReasoningEffort|null,instructions:string,input:string,options?:AgentGenerateOptions):Promise<{model:string;durationMs:number;usage:Record<string,number>|null;output:unknown}>;
}

export class AgentProviders implements AgentProvider {
  private installed=new Map<string,{digest:string;entry:object}>();
  constructor(readonly chatgpt:ChatGPTService,readonly ollama:OllamaService) {}
  readonly connections={credentials:(binding:ConnectionBinding,model:string)=>{
    const name=localModel(model);
    if(name===null)return this.chatgpt.connections.credentials(binding,model);
    const installed=this.installed.get(name);
    if(!installed)throw new ProviderValidationError('MODEL_NOT_AVAILABLE');
    return {entry:installed.entry};
  }};
  async ensureConnection(binding:ConnectionBinding,model?:string) {
    const name=localModel(model??'');
    if(name===null){await this.chatgpt.ensureConnection(binding);return;}
    try {
      const models=await this.ollama.listModels();
      const found=models.find(item=>item.name===name);
      if(!found){this.installed.delete(name);throw new ProviderValidationError('MODEL_NOT_AVAILABLE');}
      const digest=JSON.stringify(found);
      if(this.installed.get(name)?.digest!==digest)this.installed.set(name,{digest,entry:{}});
    }catch(error){this.installed.delete(name);throw this.safeError(error);}
  }
  private safeError(error:unknown) {
    if(error instanceof ProviderValidationError)return error;
    if(error&&typeof error==='object'&&'code' in error&&error.code==='FORBIDDEN')return new ProviderValidationError('FORBIDDEN');
    const code=error instanceof OllamaError?error.code:'PROVIDER_UNAVAILABLE';
    return new ProviderValidationError(code==='OLLAMA_UNAVAILABLE'?'PROVIDER_UNAVAILABLE':code);
  }
  async generate(binding:ConnectionBinding,actor:AuthUser,model:string,effort:ReasoningEffort|null,instructions:string,input:string,options?:AgentGenerateOptions) {
    const name=localModel(model);
    if(name===null)return this.chatgpt.generate(binding,actor,model,effort,instructions,input);
    await assertManager(this.ollama.options.database,binding.projectId,actor);
    if(effort)throw new ProviderValidationError('UNSUPPORTED_EFFORT');
    const inputBytes=Buffer.byteLength(instructions+input,'utf8');
    if(inputBytes>120_000)throw new ProviderValidationError('INPUT_TOO_LARGE');
    // Heuristic protection in bytes (~6,000 tokens approximate density) to safeguard headroom under num_ctx: 8192
    if(inputBytes>24_000)throw new ProviderValidationError('INPUT_TOO_LARGE');
    await this.ensureConnection(binding,model);
    const before=this.connections.credentials(binding,model);
    try {
      const response=await this.ollama.generate(name,instructions,input,{
        format:options?.schema??'json',
        signal:options?.signal,
      });
      await assertManager(this.ollama.options.database,binding.projectId,actor);
      await this.ensureConnection(binding,model);
      if(this.connections.credentials(binding,model).entry!==before.entry)throw new ProviderValidationError('AUTHORIZATION_CANCELLED');
      return {...response,model};
    }catch(error){throw this.safeError(error);}
  }
}
