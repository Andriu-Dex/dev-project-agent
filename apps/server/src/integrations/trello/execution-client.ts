import {credentialsFromEnvironment,readBoard,type TrelloCredentials} from './client.js';
import {normalizeBoard,TrelloError} from './normalize.js';
import type {TrelloSnapshot} from '@dev-project-agent/contracts';

export class ExecutionError extends Error {
  constructor(readonly code:string,readonly uncertain=false) {super('Trello execution failed.');}
}
export function executionConfiguration(environment:NodeJS.ProcessEnv) {
  if(environment.TRELLO_WRITES_ENABLED&&!['true','false'].includes(environment.TRELLO_WRITES_ENABLED))throw new ExecutionError('INVALID_WRITE_CONFIG');
  return {enabled:environment.TRELLO_WRITES_ENABLED==='true',credentials:credentialsFromEnvironment({...environment,TRELLO_TOKEN:environment.TRELLO_WRITE_TOKEN})};
}
const auth=(credentials:TrelloCredentials)=>({Accept:'application/json',Authorization:`OAuth oauth_consumer_key="${credentials.key}", oauth_token="${credentials.token}"`});
async function json(response:Response) {
  if(!response.body)throw new ExecutionError('INVALID_REMOTE_RESPONSE');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();throw new ExecutionError('REMOTE_RESPONSE_TOO_LARGE');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export interface ExecutionRemote {
  read(boardId:string,lists:string[]):Promise<TrelloSnapshot>;
  assertPermission(boardId:string):Promise<void>;
  write(cardId:string,due:string):Promise<void>;
}
export function trelloExecutionRemote(credentials:TrelloCredentials,fetcher:typeof fetch=fetch):ExecutionRemote {
  async function get(path:string) {
    try{const response=await fetcher(new URL('https://api.trello.com/1/'+path),{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:auth(credentials)});
      if(!response.ok)throw new ExecutionError(response.status===429?'RATE_LIMITED':'REMOTE_ACCESS_DENIED');return await json(response);
    }catch(error){if(error instanceof ExecutionError)throw error;throw new ExecutionError('REMOTE_READ_FAILED');}
  }
  function assertId(value:string){if(!/^[a-f0-9]{24}$/.test(value))throw new ExecutionError('INVALID_REMOTE_ID');}
  return {
    async read(boardId,lists){try{return normalizeBoard(await readBoard(boardId,credentials,fetcher),boardId,lists);}catch(error){throw new ExecutionError(error instanceof TrelloError?error.code:'REMOTE_READ_FAILED');}},
    async assertPermission(boardId){
      assertId(boardId);
      const member=await get('members/me?fields=id') as {id?:unknown};
      const board=await get(`boards/${boardId}?fields=id,closed`) as {id?:unknown;closed?:unknown};
      const memberships=await get(`boards/${boardId}/memberships?filter=all`) as {idMember?:unknown;memberType?:unknown;unconfirmed?:unknown;deactivated?:unknown}[];
      if(typeof member?.id!=='string'||board?.id!==boardId||board.closed!==false||!Array.isArray(memberships)||!memberships.some(item=>item.idMember===member.id&&['normal','admin'].includes(String(item.memberType))&&item.unconfirmed!==true&&item.deactivated!==true))throw new ExecutionError('REMOTE_ACCESS_DENIED');
    },
    async write(cardId,due){
      assertId(cardId);if(!Number.isFinite(Date.parse(due))||new Date(due).toISOString()!==due)throw new ExecutionError('INVALID_TARGET_DATE');
      try{
        const response=await fetcher(new URL(`https://api.trello.com/1/cards/${cardId}`),{method:'PUT',redirect:'error',signal:AbortSignal.timeout(15000),headers:{...auth(credentials),'Content-Type':'application/json'},body:JSON.stringify({due})});
        // Only explicit client rejections prove this request was not accepted. All other outcomes need a read.
        if(!response.ok)throw new ExecutionError(response.status===429?'RATE_LIMITED':'REMOTE_WRITE_REJECTED',![400,401,403,404,429].includes(response.status));
        const result=await json(response) as {id?:unknown;due?:unknown};
        if(result?.id!==cardId||typeof result.due!=='string'||!Number.isFinite(Date.parse(result.due))||new Date(result.due).toISOString()!==due)throw new ExecutionError('REMOTE_WRITE_UNCONFIRMED',true);
      }catch(error){if(error instanceof ExecutionError)throw new ExecutionError(error.code,error.uncertain||['INVALID_REMOTE_RESPONSE','REMOTE_RESPONSE_TOO_LARGE'].includes(error.code));throw new ExecutionError('REMOTE_WRITE_UNCONFIRMED',true);}
    },
  };
}
