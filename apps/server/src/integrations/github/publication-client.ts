import type {CodeCandidate,CodeSource} from '@dev-project-agent/contracts';
import {readCodeCatalog,gitSha,blobHash,validCodePath} from './code-client.js';
import {fingerprint} from '../../modules/proposals/contracts.js';
export class PublicationError extends Error {constructor(readonly code:string){super('GitHub publication failed.');}}
export function publicationConfiguration(environment:NodeJS.ProcessEnv){
  if(environment.GITHUB_WRITES_ENABLED&&!['true','false'].includes(environment.GITHUB_WRITES_ENABLED))throw new PublicationError('INVALID_WRITE_CONFIG');
  const token=environment.GITHUB_WRITE_TOKEN?.trim()||null;if(token&&/\s/.test(token))throw new PublicationError('INVALID_WRITE_CONFIG');return {enabled:environment.GITHUB_WRITES_ENABLED==='true',token};
}
export interface PublicationPlan {repository:string;baseBranch:string;baseSha:string;branch:string;contentHash:string;title:string;body:string;files:{path:string;beforeBlob:string;afterBlob:string}[]}
export function publicationRemote(token:string,fetcher:typeof fetch=fetch) {
  async function request(source:CodeSource,path:string,method='GET',body?:unknown,optional=false):Promise<Record<string,any>|null> {
    if(!/^[a-zA-Z0-9_.-]+$/.test(source.connection.owner)||!/^[a-zA-Z0-9_.-]+$/.test(source.connection.repository)||(path!==''&&!path.startsWith('/'))||path.includes('..'))throw new PublicationError('INVALID_DESTINATION');
    try{const response=await fetcher(`https://api.github.com/repos/${source.connection.owner}/${source.connection.repository}${path}`,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
      if(optional&&response.status===404)return null;if(!response.ok)throw new PublicationError(response.status===429?'RATE_LIMITED':response.status===403?'REMOTE_ACCESS_DENIED':'REMOTE_REQUEST_FAILED');
      if(!response.body)throw new PublicationError('INVALID_REMOTE_RESPONSE');let size=0;const chunks:Uint8Array[]=[];for await(const chunk of response.body){size+=chunk.byteLength;if(size>2_000_000)throw new PublicationError('INVALID_REMOTE_RESPONSE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch(error){if(error instanceof PublicationError)throw error;throw new PublicationError('REMOTE_UNCONFIRMED');}
  }
  const refPath=(plan:PublicationPlan)=>'/git/ref/heads/'+plan.branch.split('/').map(encodeURIComponent).join('/');
  async function verify(source:CodeSource,candidate:CodeCandidate,plan:PublicationPlan){
    const ref=await request(source,refPath(plan),'GET',undefined,true);if(!ref)return null;
    const sha=gitSha(ref.object?.sha),commit=await request(source,'/git/commits/'+sha);
    if(commit?.parents?.length!==1||commit.parents[0].sha!==source.head)throw new PublicationError('REMOTE_DISCREPANCY');
    const catalog=await readCodeCatalog({...source.connection,branch:plan.branch},token,fetcher);if(catalog.head!==sha||commit?.tree?.sha!==catalog.treeSha)throw new PublicationError('REMOTE_DISCREPANCY');
    const expected=source.inventory.map(file=>{const changed=candidate.files.find(target=>target.path===file.path);return changed?{...file,sha:changed.blobSha,size:Buffer.byteLength(changed.content)}:file;});
    const normalize=(values:typeof expected)=>values.map(file=>({path:file.path,type:file.type,mode:file.mode,sha:file.sha})).sort((a,b)=>a.path.localeCompare(b.path));
    if(fingerprint(normalize(catalog.inventory))!==fingerprint(normalize(expected)))throw new PublicationError('REMOTE_DISCREPANCY');
    const pulls=await request(source,`/pulls?state=all&head=${encodeURIComponent(source.connection.owner+':'+plan.branch)}&base=${encodeURIComponent(plan.baseBranch)}&per_page=100`);
    if(!Array.isArray(pulls)||pulls.length!==1)return null;const pull=pulls[0];
    if(pull.base?.repo?.full_name!==plan.repository||pull.head?.repo?.full_name!==plan.repository||pull.base?.ref!==plan.baseBranch||pull.head?.ref!==plan.branch||pull.head?.sha!==sha||pull.merged_at||pull.state!=='open'||pull.title!==plan.title||pull.body!==plan.body||!Number.isInteger(pull.number)||pull.html_url!==`https://github.com/${plan.repository}/pull/${pull.number}`)throw new PublicationError('REMOTE_DISCREPANCY');
    return {commitSha:sha,pullNumber:pull.number as number,pullUrl:pull.html_url as string};
  }
  return {
    async assertBase(source:CodeSource,plan:PublicationPlan){const current=await request(source,'/commits/'+encodeURIComponent(plan.baseBranch));if(current?.sha!==source.head||current.commit?.tree?.sha!==source.treeSha)throw new PublicationError('SOURCE_CHANGED');},
    async preflight(source:CodeSource,plan:PublicationPlan){const repository=await request(source,'');if(repository?.full_name!==plan.repository||repository.archived||repository.disabled||repository.fork||!repository.permissions?.push||plan.baseBranch!=='develop')throw new PublicationError('REMOTE_ACCESS_DENIED');
      const current=await request(source,'/commits/'+encodeURIComponent(plan.baseBranch));if(current?.sha!==source.head||current.commit?.tree?.sha!==source.treeSha)throw new PublicationError('SOURCE_CHANGED');
      if(await request(source,refPath(plan),'GET',undefined,true))throw new PublicationError('BRANCH_EXISTS');
    },
    async publish(source:CodeSource,candidate:CodeCandidate,plan:PublicationPlan,beforeWrite:()=>Promise<void>){
      const tree=[];for(const file of candidate.files){if(!validCodePath(file.path)||file.blobSha!==blobHash(file.content))throw new PublicationError('INVALID_SCOPE');await beforeWrite();const blob=await request(source,'/git/blobs','POST',{content:file.content,encoding:'utf-8'});if(gitSha(blob?.sha)!==file.blobSha)throw new PublicationError('REMOTE_DISCREPANCY');tree.push({path:file.path,mode:source.files.find(original=>original.path===file.path)!.mode,type:'blob',sha:file.blobSha});}
      await beforeWrite();const createdTree=await request(source,'/git/trees','POST',{base_tree:source.treeSha,tree});const treeSha=gitSha(createdTree?.sha);
      await beforeWrite();const commit=await request(source,'/git/commits','POST',{message:plan.title,tree:treeSha,parents:[source.head]}),sha=gitSha(commit?.sha);
      await beforeWrite();const ref=await request(source,'/git/refs','POST',{ref:'refs/heads/'+plan.branch,sha});if(ref?.ref!=='refs/heads/'+plan.branch||ref.object?.sha!==sha)throw new PublicationError('REMOTE_DISCREPANCY');
      await beforeWrite();await request(source,'/pulls','POST',{head:plan.branch,base:plan.baseBranch,title:plan.title,body:plan.body,draft:true});
      const verified=await verify(source,candidate,plan);if(!verified)throw new PublicationError('REMOTE_UNCONFIRMED');return verified;
    },verify,
  };
}
