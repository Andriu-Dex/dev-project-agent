import {beforeAll,describe,expect,it,vi} from 'vitest';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT,type JWTVerifyGetKey} from 'jose';
import {authorizationUrl,callbackCredentials,exchangeSignIn,inferJson,listModels,newAttempt,validateInference,verifyIdentity} from './validation.js';
let privateKey:CryptoKey,key:JWTVerifyGetKey;
const clientId='oaiapp_test',nonce='synthetic-nonce';
async function signed(overrides:Record<string,unknown>={}){
  return new SignJWT({nonce,...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience(clientId).setSubject('test-subject').setIssuedAt().setExpirationTime('2 minutes').sign(privateKey);
}
beforeAll(async()=>{const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;key=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'test',alg:'RS256'}]});});
describe('Official ChatGPT validation contract',()=>{
  it('sends only documented reasoning levels and preserves the provider default',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('data: {"type":"response.output_text.delta","delta":"{}"}\n\ndata: {"type":"response.completed"}\n\n'));
    await inferJson('synthetic','gpt-6.1-sol','instructions','{}',fetcher,undefined,'xhigh');expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body)).reasoning).toEqual({effort:'xhigh'});
    await inferJson('synthetic','gpt-6.1-sol','instructions','{}',fetcher);expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).not.toHaveProperty('reasoning');
    await expect(inferJson('synthetic','unknown-model','instructions','{}',fetcher,undefined,'high')).rejects.toMatchObject({code:'UNSUPPORTED_EFFORT'});expect(fetcher).toHaveBeenCalledTimes(2);
    const models=await listModels('synthetic',async()=>Response.json({models:[{slug:'gpt-6.1-sol',visibility:'list'},{slug:'unknown-model',visibility:'list',reasoning_efforts:['ultra']}]}));expect(models[0]!.reasoningEfforts).toEqual(['low','medium','high','xhigh','max']);expect(models[1]).not.toHaveProperty('reasoningEfforts');
  });
  it('creates fresh PKCE, state and nonce with a stable application and host identity',()=>{
    const first=newAttempt('http://127.0.0.1:1455/auth/callback',null,null),second=newAttempt(first.redirectUri,null,null);
    expect(first.state).not.toBe(second.state);expect(first.nonce).not.toBe(second.nonce);expect(first.verifier).not.toBe(second.verifier);
    const url=authorizationUrl(first,'urn:uuid:synthetic');expect(url.host).toBe('auth.openai.com');expect(url.searchParams.get('agent_name_hint')).toBe('dev-project-agent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('code_challenge')).not.toBe(first.verifier);
    expect(authorizationUrl({...first,clientId},'urn:uuid:synthetic').searchParams.has('agent_name_hint')).toBe(false);
  });
  it('rejects unbound callbacks, denied consent and swapped registrations',()=>{
    const attempt=newAttempt('http://127.0.0.1:1455/auth/callback',null,null),url=new URL(attempt.redirectUri);
    url.search=new URLSearchParams({state:attempt.state,code:'test-code',client_id:clientId}).toString();
    expect(callbackCredentials(url,attempt)).toEqual({clientId,code:'test-code'});
    expect(()=>callbackCredentials(url,{...attempt,state:'other'})).toThrow();
    expect(()=>callbackCredentials(url,{...attempt,clientId:'oaiapp_other'})).toThrow();
    url.searchParams.set('error','access_denied');expect(()=>callbackCredentials(url,attempt)).toThrow();
  });
  it('verifies the signed identity, nonce, audience, expiration and selected account',async()=>{
    const token=await signed();expect(await verifyIdentity(token,clientId,nonce,null,key)).toBe('test-subject');
    for(const [audience,expectedNonce,subject] of [['oaiapp_other',nonce,null],[clientId,'wrong',null],[clientId,nonce,'other']] as const)
      await expect(verifyIdentity(token,audience,expectedNonce,subject,key)).rejects.toThrow();
    const expired=await new SignJWT({nonce}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience(clientId).setSubject('test-subject').setIssuedAt().setExpirationTime(1).sign(privateKey);
    await expect(verifyIdentity(expired,clientId,nonce,null,key)).rejects.toThrow();
  });
  it('requires granted plan permission independently of a valid identity',async()=>{
    const token=await signed(),attempt={...newAttempt('http://127.0.0.1:1455/auth/callback',null,null),nonce};
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({id_token:token,access_token:'synthetic-access',scope:'openid profile email'}));
    await expect(exchangeSignIn(attempt,{clientId,code:'test'},fetcher,key)).rejects.toMatchObject({code:'PLAN_PERMISSION_MISSING'});
    expect(String(fetcher.mock.calls[0]![1]!.body)).toContain('code_verifier=');expect(String(fetcher.mock.calls[0]![0])).not.toContain('synthetic-access');
  });
  it('uses the account catalog, ephemeral streaming and a terminal completed event',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({models:[{slug:'account-model',visibility:'list'}]}))
      .mockResolvedValueOnce(new Response('data: {"type":"response.output_text.delta","delta":"{\\"status\\":\\"ok\\"}"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":4,"output_tokens":2,"private":"hidden"}}}\n\n'));
    const result=await validateInference('synthetic-access',fetcher);expect(result).toMatchObject({model:'account-model',completed:true,structuredOutputValid:true,usage:{input_tokens:4,output_tokens:2}});
    expect(JSON.stringify(result)).not.toContain('hidden');expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toMatchObject({store:false,stream:true,model:'account-model'});
  });
  it('rejects interrupted or failed inference instead of reporting partial text as success',async()=>{
    for(const events of ['data: {"type":"response.output_text.delta","delta":"{\\"status\\":\\"ok\\"}"}\n\n','data: {"type":"response.failed"}\n\n']){
      const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({models:[{slug:'account-model',visibility:'list'}]})).mockResolvedValueOnce(new Response(events));
      await expect(validateInference('synthetic-access',fetcher)).rejects.toThrow();
    }
  });
});
