import {describe,expect,it} from 'vitest';
import {executionConfiguration,trelloExecutionRemote} from './execution-client.js';
import {boardId,memberId} from './fixtures.js';

const credentials={key:'k'.repeat(32),token:'t'.repeat(64)},cardId='d'.repeat(24),due='2026-11-01T22:00:00.000Z';
describe('Trello execution transport',()=>{
  it('requires a separate write token and defaults to disabled',()=>{
    expect(executionConfiguration({TRELLO_API_KEY:credentials.key,TRELLO_TOKEN:credentials.token})).toEqual({enabled:false,credentials:null});
    expect(executionConfiguration({TRELLO_WRITES_ENABLED:'false',TRELLO_API_KEY:credentials.key,TRELLO_WRITE_TOKEN:credentials.token})).toEqual({enabled:false,credentials});
    expect(()=>executionConfiguration({TRELLO_WRITES_ENABLED:'yes'})).toThrow();
  });
  it('writes only the due field to a fixed card endpoint with no credentials in the URL',async()=>{
    let calls=0;const remote=trelloExecutionRemote(credentials,async(input,options)=>{calls++;const url=new URL(String(input));expect(url.href).toBe('https://api.trello.com/1/cards/'+cardId);expect(options?.method).toBe('PUT');expect(options?.redirect).toBe('error');expect(JSON.parse(String(options?.body))).toEqual({due});expect(new Headers(options?.headers).get('Authorization')).toContain('oauth_token=');return Response.json({id:cardId,due});});
    await remote.write(cardId,due);expect(calls).toBe(1);await expect(remote.write('../other',due)).rejects.toMatchObject({code:'INVALID_REMOTE_ID'});expect(calls).toBe(1);
  });
  it.each([400,401,403,404,429])('treats HTTP %s as a rejected write without replay',async status=>{
    let calls=0;const remote=trelloExecutionRemote(credentials,async()=>{calls++;return new Response('PRIVATE_ERROR',{status});});await expect(remote.write(cardId,due)).rejects.toMatchObject({uncertain:false});expect(calls).toBe(1);
  });
  it.each(['network','server','invalid','large'])('keeps %s results uncertain and does not replay',async mode=>{
    let calls=0;const remote=trelloExecutionRemote(credentials,async()=>{calls++;if(mode==='network')throw new Error('PRIVATE_TOKEN');if(mode==='server')return new Response(null,{status:500});if(mode==='large')return new Response('x'.repeat(1_000_001));return Response.json({id:'other',due});});
    await expect(remote.write(cardId,due)).rejects.toMatchObject({uncertain:true});expect(calls).toBe(1);
  });
  it.each(['admin','normal','observer','unconfirmed','closed'])('checks board membership for %s',async mode=>{
    const remote=trelloExecutionRemote(credentials,async input=>{const url=new URL(String(input));return Response.json(url.pathname==='/1/members/me'?{id:memberId}:url.pathname.endsWith('/memberships')?[{idMember:memberId,memberType:mode==='unconfirmed'?'normal':mode,unconfirmed:mode==='unconfirmed'}]:{id:boardId,closed:mode==='closed'});});
    if(['admin','normal'].includes(mode))await expect(remote.assertPermission(boardId)).resolves.toBeUndefined();else await expect(remote.assertPermission(boardId)).rejects.toMatchObject({code:'REMOTE_ACCESS_DENIED'});
  });
});
