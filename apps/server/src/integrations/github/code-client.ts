import {createHash} from 'node:crypto';
import type {CodeSource,CodeCatalog,CodeFile} from '@dev-project-agent/contracts';
import {GitHubError,type GitHubConnection} from './client.js';

export const sourceLimits={files:8,fileBytes:30_000,totalBytes:120_000,treeEntries:2500};
export function validCodePath(path:string) {
  return path.length<=240&&/^[a-zA-Z0-9_.@/-]+\.(?:[cm]?[jt]sx?|java|json)$/.test(path)&&!path.split('/').some(part=>!part||part==='.'||part==='..'||/^(?:node_modules|vendor|dist|build|target|coverage|secrets|credentials|\.git|\.github)$/i.test(part))&&!/(?:^|\/)(?:\.env[^/]*|.*(?:secret|credential|password|private[-_]?key).*|package-lock\.json|.*\.min\.[jt]s)$/i.test(path);
}
export function assertSafeCode(content:string) {
  if(content.includes('\0')||/(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|-----BEGIN [^\n]*PRIVATE KEY|(?:password|token|secret|api[_-]?key)\s*[:=]\s*["'][^"'\r\n]{12,}["']|https?:\/\/[^\s/:]+:[^\s/@]+@)/i.test(content))throw new GitHubError('SENSITIVE_SOURCE');
}
export const blobHash=(content:string)=>{const data=Buffer.from(content,'utf8');return createHash('sha1').update(`blob ${data.byteLength}\0`).update(data).digest('hex');};
export function githubApi(connection:GitHubConnection,token:string|null,fetcher:typeof fetch=fetch) {
  if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(connection.owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(connection.repository)||['.','..'].includes(connection.repository)||!connection.branch||connection.branch.length>200||/[\x00-\x20]/.test(connection.branch))throw new GitHubError('INVALID_CONNECTION');
  const prefix=`https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repository)}`;
  async function get(path:string,allowMissing=false,allowNext=false) {
    try {
      const response=await fetcher(new URL(prefix+path),{method:'GET',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'dev-project-agent',...(token?{Authorization:`Bearer ${token}`}:{})}});
      if(allowMissing&&response.status===404)return null;
      if(!response.ok)throw new GitHubError(response.status===429||response.headers.get('x-ratelimit-remaining')==='0'?'RATE_LIMITED':[401,403].includes(response.status)?'ACCESS_DENIED':response.status===404?'NOT_FOUND':'GITHUB_REQUEST_FAILED');
      if(!response.body)throw new GitHubError('INVALID_SOURCE');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw new GitHubError('SOURCE_TOO_LARGE');}chunks.push(value);}
      if(!allowNext&&/rel="next"/.test(response.headers.get('link')??''))throw new GitHubError('INCOMPLETE_SOURCE');
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }catch(error){if(error instanceof GitHubError)throw error;throw new GitHubError('GITHUB_REQUEST_FAILED');}
  }
  return {get};
}
export function gitSha(value:unknown):string {if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value))throw new GitHubError('INVALID_SOURCE');return value;}
export async function readCodeCatalog(connection:GitHubConnection,token:string|null,fetcher:typeof fetch=fetch,inventoryLimit=sourceLimits.treeEntries):Promise<CodeCatalog> {
  const api=githubApi(connection,token,fetcher);
  const commit=await api.get('/commits/'+encodeURIComponent(connection.branch)) as {sha:unknown;commit:{tree:{sha:unknown}}};
  const head=gitSha(commit.sha),treeSha=gitSha(commit.commit?.tree?.sha);
  const tree=await api.get('/git/trees/'+treeSha+'?recursive=1') as {sha:unknown;truncated:unknown;tree:unknown[]};
  if(gitSha(tree.sha)!==treeSha||tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>inventoryLimit)throw new GitHubError('INCOMPLETE_SOURCE');
  const entries=tree.tree.map(raw=>{const item=raw as {path:unknown;type:unknown;mode:unknown;sha:unknown;size?:unknown};
    if(!item||typeof item.path!=='string'||item.path.length>1000||/[\x00-\x1f]/.test(item.path)||!['tree','blob','commit'].includes(String(item.type))||typeof item.mode!=='string')throw new GitHubError('INVALID_SOURCE');
    return {path:item.path,type:item.type as 'tree'|'blob'|'commit',mode:item.mode,sha:gitSha(item.sha),size:typeof item.size==='number'?item.size:null};});
  if(new Set(entries.map(entry=>entry.path)).size!==entries.length)throw new GitHubError('INCOMPLETE_SOURCE');
  return {connection,head,treeSha,observedAt:new Date().toISOString(),files:entries.filter(entry=>entry.type==='blob'&&['100644','100755'].includes(entry.mode)&&validCodePath(entry.path)&&entry.size!==null&&entry.size>=0&&entry.size<=sourceLimits.fileBytes).map(entry=>({path:entry.path,blobSha:entry.sha,mode:entry.mode,size:entry.size!})),inventory:entries.filter((entry):entry is typeof entry & {type:'blob'|'commit'}=>entry.type!=='tree'),limits:sourceLimits};
}
export async function readPinnedBlob(connection:GitHubConnection,entry:{blobSha:string;size:number},token:string|null,fetcher:typeof fetch=fetch) {
  const raw=await githubApi(connection,token,fetcher).get('/git/blobs/'+gitSha(entry.blobSha)) as {sha:unknown;encoding:unknown;size:unknown;content:unknown};
  if(gitSha(raw.sha)!==entry.blobSha||raw.encoding!=='base64'||raw.size!==entry.size||typeof raw.content!=='string'||!/^[A-Za-z0-9+/=\r\n]*$/.test(raw.content))throw new GitHubError('INVALID_SOURCE');
  const data=Buffer.from(raw.content,'base64');if(data.byteLength!==entry.size)throw new GitHubError('INVALID_SOURCE');
  let content:string;try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);}catch{throw new GitHubError('UNSUPPORTED_ENCODING');}
  assertSafeCode(content);if(blobHash(content)!==entry.blobSha)throw new GitHubError('INVALID_SOURCE');return content;
}
export async function readCodeSource(connection:GitHubConnection,request:{paths:string[];mode:'files'|'comparison';baseSha:string|null;expectedHead:string},token:string|null,fetcher:typeof fetch=fetch):Promise<CodeSource> {
  if(!request.paths.length||request.paths.length>sourceLimits.files||new Set(request.paths).size!==request.paths.length||request.paths.some(path=>!validCodePath(path)))throw new GitHubError('INVALID_SCOPE');
  gitSha(request.expectedHead);if(request.baseSha)gitSha(request.baseSha);
  const catalog=await readCodeCatalog(connection,token,fetcher),api=githubApi(connection,token,fetcher);
  if(catalog.head!==request.expectedHead)throw new GitHubError('SOURCE_CHANGED');
  if(request.mode==='comparison') {
    if(!request.baseSha||request.baseSha===catalog.head)throw new GitHubError('NO_CHANGED_FILES');
    const compare=await api.get(`/compare/${request.baseSha}...${catalog.head}?per_page=1`,false,true) as {status:string;files:{filename:string;status:string}[]};
    // Compare commits are paginated; only the first-page file list is used. The response may include a next link.
    if(compare.status!=='ahead'||!Array.isArray(compare.files)||compare.files.length>=300)throw new GitHubError('INVALID_COMPARISON');
    const changed=new Set(compare.files.filter(file=>file.status!=='removed').map(file=>file.filename));if(request.paths.some(path=>!changed.has(path)))throw new GitHubError('INVALID_SCOPE');
  }
  const files:CodeFile[]=[];let total=0;
  for(const path of request.paths){const entry=catalog.files.find(file=>file.path===path);if(!entry)throw new GitHubError('INVALID_SCOPE');
    const raw=await api.get('/git/blobs/'+entry.blobSha) as {sha:unknown;encoding:unknown;size:unknown;content:unknown};
    if(gitSha(raw.sha)!==entry.blobSha||raw.encoding!=='base64'||raw.size!==entry.size||typeof raw.content!=='string'||!/^[A-Za-z0-9+/=\r\n]*$/.test(raw.content))throw new GitHubError('INVALID_SOURCE');
    const data=Buffer.from(raw.content,'base64');total+=data.byteLength;if(data.byteLength!==entry.size||total>sourceLimits.totalBytes)throw new GitHubError('SOURCE_TOO_LARGE');
    let content:string;try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);}catch{throw new GitHubError('UNSUPPORTED_ENCODING');}
    assertSafeCode(content);if(blobHash(content)!==entry.blobSha)throw new GitHubError('INVALID_SOURCE');files.push({...entry,content});
  }
  return {schemaVersion:1,connection,head:catalog.head,treeSha:catalog.treeSha,observedAt:catalog.observedAt,mode:request.mode,baseSha:request.baseSha,files,inventory:catalog.inventory};
}
