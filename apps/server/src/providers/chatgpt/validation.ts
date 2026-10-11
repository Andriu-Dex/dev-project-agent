import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {setTimeout as delay} from 'node:timers/promises';
import type {ReasoningEffort} from '@dev-project-agent/contracts';

// Model-specific support verified against the official GPT-6.1 Sol model documentation.
export function supportedEfforts(model:string):ReasoningEffort[] {return model==='gpt-6.1-sol'?['low','medium','high','xhigh','max']:[];}

export class ProviderValidationError extends Error {constructor(readonly code:string){super('Provider validation failed.');}}
export interface SignInAttempt {state:string;nonce:string;verifier:string;redirectUri:string;clientId:string|null;subject:string|null}
export function authorizationUrl(attempt:SignInAttempt,hostId:string) {
  const url=new URL('https://auth.openai.com/api/accounts/authorize');
  url.search=new URLSearchParams({client_id:attempt.clientId??'dynamic_agent_client',...(!attempt.clientId?{agent_name_hint:'dev-project-agent'}:{}),
    ext_agent_host_id:hostId,response_type:'code',redirect_uri:attempt.redirectUri,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource:'https://api.openai.com/v1',state:attempt.state,nonce:attempt.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(attempt.verifier).digest('base64url')}).toString();
  return url;
}
export function newAttempt(redirectUri:string,clientId:string|null,subject:string|null):SignInAttempt {
  return {state:randomBytes(32).toString('base64url'),nonce:randomBytes(32).toString('base64url'),verifier:randomBytes(48).toString('base64url'),redirectUri,clientId,subject};
}
export function callbackCredentials(url:URL,attempt:SignInAttempt) {
  const supplied=url.searchParams.get('state')??'';
  if(Buffer.byteLength(supplied)!==Buffer.byteLength(attempt.state)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(attempt.state)))throw new ProviderValidationError('INVALID_STATE');
  if(url.searchParams.has('error'))throw new ProviderValidationError('AUTHORIZATION_DENIED');
  const issued=url.searchParams.get('client_id')??attempt.clientId;
  if(!issued||!/^oaiapp_[a-zA-Z0-9_-]+$/.test(issued)||(attempt.clientId&&issued!==attempt.clientId))throw new ProviderValidationError('INVALID_CLIENT');
  const code=url.searchParams.get('code');if(!code||code.length>4096)throw new ProviderValidationError('MISSING_CODE');
  return {clientId:issued,code};
}
export async function readJson(response:Response) {
  if(response.status===401)throw new ProviderValidationError('AUTHORIZATION_EXPIRED');
  if(response.status===429)throw new ProviderValidationError('USAGE_LIMIT');
  if(!response.ok||!response.body)throw new ProviderValidationError('PROVIDER_UNAVAILABLE');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();throw new ProviderValidationError('RESPONSE_TOO_LARGE');}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;}catch{throw new ProviderValidationError('INVALID_RESPONSE');}
}
export async function verifyIdentity(idToken:string,clientId:string,nonce:string,subject:string|null,key?:JWTVerifyGetKey) {
  const jwks=key??createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'),{timeoutDuration:15_000});
  try{
    const {payload}=await jwtVerify(idToken,jwks,{issuer:'https://auth.openai.com',audience:clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub','nonce']});
    if(payload.nonce!==nonce||typeof payload.sub!=='string'||(subject!==null&&payload.sub!==subject))throw new ProviderValidationError('IDENTITY_MISMATCH');
    return payload.sub;
  }catch(error){if(error instanceof ProviderValidationError)throw error;throw new ProviderValidationError('INVALID_ID_TOKEN');}
}
export async function exchangeSignIn(attempt:SignInAttempt,credentials:{clientId:string;code:string},fetcher:typeof fetch=fetch,key?:JWTVerifyGetKey) {
  const body=new URLSearchParams({grant_type:'authorization_code',client_id:credentials.clientId,code:credentials.code,code_verifier:attempt.verifier,redirect_uri:attempt.redirectUri,resource:'https://api.openai.com/v1'});
  const data=await readJson(await fetcher('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body}));
  if(typeof data.id_token!=='string'||typeof data.access_token!=='string'||typeof data.scope!=='string')throw new ProviderValidationError('INVALID_RESPONSE');
  const subject=await verifyIdentity(data.id_token,credentials.clientId,attempt.nonce,attempt.subject,key);
  const scope=new Set(data.scope.split(' '));
  if(!scope.has('chatgpt.tokens.use.direct')||!scope.has('resource.invoke'))throw new ProviderValidationError('PLAN_PERMISSION_MISSING');
  const expiresIn=typeof data.expires_in==='number'&&Number.isFinite(data.expires_in)&&data.expires_in>0?data.expires_in:null;
  return {subject,accessToken:data.access_token,expiresIn,refreshToken:typeof data.refresh_token==='string'&&data.refresh_token.length<=64_000?data.refresh_token:null,earliestRefreshAt:refreshTime(data.earliest_refresh_at)};
}
function refreshTime(value:unknown) {
  if(value===undefined||value===null)return 0;
  const time=typeof value==='number'?value*1000:typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(time)||time<0)throw new ProviderValidationError('INVALID_RESPONSE');return time;
}
export async function refreshAccess(clientId:string,refreshToken:string,fetcher:typeof fetch=fetch) {
  let response:Response;
  try{response=await fetcher('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:refreshToken,resource:'https://api.openai.com/v1'})});}
  catch{throw new ProviderValidationError('REFRESH_UNCERTAIN');}
  if(!response.ok){
    if(response.status>=500||response.status===429)throw new ProviderValidationError('REFRESH_UNAVAILABLE');
    let code:unknown;try{const body=await readJson(new Response(response.body,{status:200}));code=typeof body.error==='string'?body.error:(body.error as Record<string,unknown>|undefined)?.code;}catch{}
    if(['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused'].includes(String(code)))throw new ProviderValidationError('REFRESH_REAUTHORIZATION_REQUIRED');
    throw new ProviderValidationError(code==='invalid_client'?'INVALID_CLIENT':'REFRESH_REAUTHORIZATION_REQUIRED');
  }
  let data:Record<string,unknown>;try{data=await readJson(response);}catch{throw new ProviderValidationError('REFRESH_UNCERTAIN');}
  if(typeof data.access_token!=='string'||!data.access_token||data.access_token.length>64_000||typeof data.refresh_token!=='string'||!data.refresh_token||data.refresh_token.length>64_000||typeof data.expires_in!=='number'||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new ProviderValidationError('REFRESH_UNCERTAIN');
  if(data.scope!==undefined&&(typeof data.scope!=='string'||!['resource.invoke','chatgpt.tokens.use.direct'].every(scope=>String(data.scope).split(' ').includes(scope))))throw new ProviderValidationError('PLAN_PERMISSION_MISSING');
  return {accessToken:data.access_token,refreshToken:data.refresh_token,expiresIn:data.expires_in,earliestRefreshAt:refreshTime(data.earliest_refresh_at)};
}
export async function revokeAccess(clientId:string,refreshToken:string,fetcher:typeof fetch=fetch) {
  const discovery=await readJson(await fetcher('https://auth.openai.com/.well-known/openid-configuration',{redirect:'error',signal:AbortSignal.timeout(10_000)}));
  const endpoint=typeof discovery.revocation_endpoint==='string'?new URL(discovery.revocation_endpoint):null;
  if(!endpoint||endpoint.origin!=='https://auth.openai.com'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new ProviderValidationError('INVALID_RESPONSE');
  for(let attempt=0;attempt<3;attempt++){
    let response:Response|null=null;
    try{response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:refreshToken,token_type_hint:'refresh_token',client_id:clientId})});}catch{}
    if(response?.status===200)return;
    if(response&&response.status<500)break;
    if(attempt<2)await delay(200*2**attempt);
  }
  throw new ProviderValidationError('PROVIDER_UNAVAILABLE');
}
export async function listModels(accessToken:string,fetcher:typeof fetch=fetch) {
  const catalog=await readJson(await fetcher('https://api.openai.com/v1/models',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{Authorization:`Bearer ${accessToken}`}}));
  const models=Array.isArray(catalog.models)?catalog.models:[];
  const visible=models.filter(value=>value&&typeof value==='object'&&(value as Record<string,unknown>).visibility==='list'&&typeof (value as Record<string,unknown>).slug==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(String((value as Record<string,unknown>).slug))) as {slug:string;display_name?:string}[];
  if(!visible.length)throw new ProviderValidationError('NO_AVAILABLE_MODELS');
  return visible.slice(0,100).map(value=>({slug:value.slug,displayName:typeof value.display_name==='string'?value.display_name.slice(0,120):value.slug,...(supportedEfforts(value.slug).length?{reasoningEfforts:supportedEfforts(value.slug)}:{})}));
}
export async function inferJson(accessToken:string,model:string,instructions:string,input:string,fetcher:typeof fetch=fetch,signal?:AbortSignal,effort:ReasoningEffort|null=null) {
  if(effort&&!supportedEfforts(model).includes(effort))throw new ProviderValidationError('UNSUPPORTED_EFFORT');
  if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(model)||Buffer.byteLength(input)>32_000||Buffer.byteLength(instructions)>12_000)throw new ProviderValidationError('INVALID_REQUEST');
  const startedAt=Date.now();
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60_000)]):AbortSignal.timeout(60_000),headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,instructions,input:[{role:'user',content:input}],store:false,stream:true,...(effort?{reasoning:{effort}}:{})})});
  if(response.status===401)throw new ProviderValidationError('AUTHORIZATION_EXPIRED');
  if(response.status===429)throw new ProviderValidationError('USAGE_LIMIT');
  if(!response.ok||!response.body)throw new ProviderValidationError('INFERENCE_UNAVAILABLE');
  const decoder=new TextDecoder();let buffer='',output='',completed=false,size=0,usage:unknown=null;
  for await(const chunk of response.body){
    size+=chunk.byteLength;if(size>1_000_000)throw new ProviderValidationError('RESPONSE_TOO_LARGE');buffer=(buffer+decoder.decode(chunk,{stream:true})).replace(/\r\n/g,'\n');
    let separator:number;
    while((separator=buffer.indexOf('\n\n'))>=0){
      const event=buffer.slice(0,separator);buffer=buffer.slice(separator+2);
      const data=event.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
      if(!data||data==='[DONE]')continue;
      let value:Record<string,unknown>;try{value=JSON.parse(data);}catch{throw new ProviderValidationError('INVALID_STREAM');}
      if(['response.failed','response.incomplete','error'].includes(String(value.type))) {
        const error=(value.response as Record<string,unknown>|undefined)?.error??value.error;
        const code=error&&typeof error==='object'?(error as Record<string,unknown>).code:null;
        throw new ProviderValidationError(['subscription_sharing_usage_limit_exceeded','subscription_sharing_usage_unavailable'].includes(String(code))?'USAGE_LIMIT':'INFERENCE_FAILED');
      }
      if(value.type==='response.output_text.delta'&&typeof value.delta==='string')output+=value.delta;
      if(value.type==='response.completed'){completed=true;usage=(value.response as Record<string,unknown>|undefined)?.usage??null;}
    }
  }
  if(!completed)throw new ProviderValidationError('INCOMPLETE_STREAM');
  let parsed:unknown;try{parsed=JSON.parse(output.trim());}catch{throw new ProviderValidationError('INVALID_MODEL_OUTPUT');}
  // Retain only numeric aggregate usage, never arbitrary provider metadata or generated text.
  const observedUsage=usage&&typeof usage==='object'?Object.fromEntries(Object.entries(usage).filter(([key,value])=>['input_tokens','output_tokens','total_tokens'].includes(key)&&typeof value==='number')):null;
  return {model,durationMs:Date.now()-startedAt,usage:observedUsage,output:parsed};
}
export async function validateInference(accessToken:string,fetcher:typeof fetch=fetch) {
  const model=(await listModels(accessToken,fetcher))[0]!.slug;
  const result=await inferJson(accessToken,model,'Return only the requested JSON.','Return exactly this JSON and no other text: {"status":"ok"}',fetcher);
  if(!result.output||typeof result.output!=='object'||(result.output as Record<string,unknown>).status!=='ok')throw new ProviderValidationError('INVALID_MODEL_OUTPUT');
  return {model,durationMs:result.durationMs,usage:result.usage,completed:true,structuredOutputValid:true};
}
