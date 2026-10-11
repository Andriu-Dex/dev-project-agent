import {randomBytes} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {credentialKey,openTokens,sealTokens} from './vault.js';
import {refreshAccess,revokeAccess} from './validation.js';
const binding={projectId:'project',userId:'user',authVersion:1};
const tokens={accessToken:'SYNTHETIC_ACCESS',refreshToken:'SYNTHETIC_REFRESH',clientId:'oaiapp_test',subject:'synthetic-subject'};
describe('Renewable credential protection and protocol',()=>{
  it('encrypts every token with authenticated account and authority binding',()=>{
    const key=randomBytes(32),encrypted=sealTokens(key,binding,tokens);expect(encrypted).not.toContain('SYNTHETIC');expect(openTokens(key,binding,encrypted)).toEqual(tokens);
    for(const other of [{...binding,projectId:'other'},{...binding,userId:'other'},{...binding,authVersion:2}])expect(()=>openTokens(key,other,encrypted)).toThrow();
    expect(()=>openTokens(randomBytes(32),binding,encrypted)).toThrow();expect(()=>openTokens(key,binding,encrypted.slice(0,-4)+'xxxx')).toThrow();
    expect(()=>credentialKey('short')).toThrow();expect(credentialKey(key.toString('hex'))).toEqual(key);
  });
  it('uses the issued client and latest refresh token without expanding scopes',async()=>{
    const fetcher:typeof fetch=async(input,options)=>{expect(String(input)).toBe('https://auth.openai.com/api/accounts/oauth/token');const body=new URLSearchParams(String(options!.body));expect(Object.fromEntries(body)).toEqual({grant_type:'refresh_token',client_id:tokens.clientId,refresh_token:tokens.refreshToken,resource:'https://api.openai.com/v1'});return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,earliest_refresh_at:1791748800});};
    expect(await refreshAccess(tokens.clientId,tokens.refreshToken,fetcher)).toMatchObject({accessToken:'new-access',refreshToken:'new-refresh',earliestRefreshAt:1791748800000});
  });
  it('distinguishes terminal refresh errors, temporary outages and uncertain rotations',async()=>{
    for(const code of ['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused'])await expect(refreshAccess(tokens.clientId,tokens.refreshToken,async()=>Response.json({error:code},{status:400}))).rejects.toHaveProperty('code','REFRESH_REAUTHORIZATION_REQUIRED');
    await expect(refreshAccess(tokens.clientId,tokens.refreshToken,async()=>Response.json({error:'invalid_client'},{status:400}))).rejects.toHaveProperty('code','INVALID_CLIENT');
    await expect(refreshAccess(tokens.clientId,tokens.refreshToken,async()=>new Response('private detail',{status:503}))).rejects.toHaveProperty('code','REFRESH_UNAVAILABLE');
    await expect(refreshAccess(tokens.clientId,tokens.refreshToken,async()=>{throw new Error('network detail');})).rejects.toHaveProperty('code','REFRESH_UNCERTAIN');
    await expect(refreshAccess(tokens.clientId,tokens.refreshToken,async()=>Response.json({access_token:'new',expires_in:3600}))).rejects.toHaveProperty('code','REFRESH_UNCERTAIN');
  });
  it('discovers and constrains the revocation endpoint and accepts empty HTTP 200',async()=>{
    let calls=0;await revokeAccess(tokens.clientId,tokens.refreshToken,async(input,options)=>{calls++;if(calls===1)return Response.json({revocation_endpoint:'https://auth.openai.com/oauth/revoke'});expect(String(input)).toBe('https://auth.openai.com/oauth/revoke');expect(Object.fromEntries(new URLSearchParams(String(options!.body)))).toEqual({token:tokens.refreshToken,token_type_hint:'refresh_token',client_id:tokens.clientId});return new Response(null,{status:200});});expect(calls).toBe(2);
    await expect(revokeAccess(tokens.clientId,tokens.refreshToken,async()=>Response.json({revocation_endpoint:'https://evil.example/revoke'}))).rejects.toHaveProperty('code','INVALID_RESPONSE');
  });
});
