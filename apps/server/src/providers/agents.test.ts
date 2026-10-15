import {describe,it,expect,vi} from 'vitest';
import {AgentProviders} from './agents.js';
import {ChatGPTService} from './chatgpt/service.js';
import {OllamaService} from './ollama/service.js';
import type {TrelloDatabase} from '../integrations/trello/service.js';
import type {AuthUser} from '../modules/auth/repository.js';

const binding={projectId:'project',userId:'user',authVersion:1,sessionId:'session'};
const actor={id:'user',auth_version:1} as AuthUser;
function setup() {
  let allowed=true,digest='one',available=true,revokeOnResponse=false;
  const database={query:async()=>({rows:allowed?[{id:'user'}]:[]})} as unknown as TrelloDatabase;
  const calls:string[]=[];
  const fetcher:typeof fetch=async(url,request)=>{
    calls.push(String(url));
    if(!available)throw new Error('PRIVATE_FAILURE');
    if(String(url).endsWith('/tags'))return Response.json({models:[{name:'org/model:7b',digest,size:10,modified_at:digest}]});
    const body=JSON.parse(String(request?.body));expect(body.model).toBe('org/model:7b');expect(request?.headers).not.toHaveProperty('Authorization');
    if(revokeOnResponse)allowed=false;
    return Response.json({message:{content:'{"result":"ok"}'},eval_count:3});
  };
  const chatgpt=new ChatGPTService({database,callbackOrigin:'http://127.0.0.1:3100'});
  const remote=vi.spyOn(chatgpt,'generate');
  const router=new AgentProviders(chatgpt,new OllamaService({database,fetcher}));
  return {router,calls,remote,revokeDuringInference:()=>{revokeOnResponse=true;},deny:()=>{allowed=false;},replace:()=>{digest='two';},offline:()=>{available=false;}};
}
describe('Explicit agent provider routing',()=>{
  it('runs local inference without a ChatGPT login or cloud credentials',async()=>{
    const test=setup();const response=await test.router.generate(binding,actor,'ollama:org/model:7b',null,'instructions','{}');
    expect(response.model).toBe('ollama:org/model:7b');expect(response.output).toEqual({result:'ok'});expect(test.remote).not.toHaveBeenCalled();
  });
  it('does not fall back to ChatGPT when the selected local provider fails',async()=>{
    const test=setup();test.offline();await expect(test.router.generate(binding,actor,'ollama:org/model:7b',null,'instructions','{}')).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});expect(test.remote).not.toHaveBeenCalled();
  });
  it('rejects unsupported effort and oversized evidence before inference',async()=>{
    const test=setup();await expect(test.router.generate(binding,actor,'ollama:org/model:7b','high','instructions','{}')).rejects.toMatchObject({code:'UNSUPPORTED_EFFORT'});
    await expect(test.router.generate(binding,actor,'ollama:org/model:7b',null,'instructions','x'.repeat(120001))).rejects.toMatchObject({code:'INPUT_TOO_LARGE'});expect(test.calls).toHaveLength(0);
  });
  it('retains stable authorization identity until the installed model changes',async()=>{
    const test=setup(),model='ollama:org/model:7b';await test.router.ensureConnection(binding,model);const before=test.router.connections.credentials(binding,model).entry;
    await test.router.ensureConnection(binding,model);expect(test.router.connections.credentials(binding,model).entry).toBe(before);
    test.replace();await test.router.ensureConnection(binding,model);expect(test.router.connections.credentials(binding,model).entry).not.toBe(before);
  });
  it('checks manager access before contacting the local provider',async()=>{
    const test=setup();test.deny();await expect(test.router.generate(binding,actor,'ollama:org/model:7b',null,'instructions','{}')).rejects.toMatchObject({code:'FORBIDDEN'});expect(test.calls).toHaveLength(0);
  });
  it('discards a completed local response if the manager was revoked during inference',async()=>{
    const test=setup();test.revokeDuringInference();await expect(test.router.generate(binding,actor,'ollama:org/model:7b',null,'instructions','{}')).rejects.toMatchObject({code:'FORBIDDEN'});expect(test.remote).not.toHaveBeenCalled();
  });

});
