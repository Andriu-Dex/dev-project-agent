import {createHash} from 'node:crypto';
import {blobHash} from '../../integrations/github/code-client.js';
import {codeFixture,codeSourceFetcher} from './fixtures.js';

export function publicationFixture(mode:'ok'|'lost_response'|'denied'='ok'){
  const source=codeFixture(),writes:string[]=[],refs=new Map<string,string>(),blobs=new Map<string,string>(),trees=new Map<string,typeof source.inventory>(),commits=new Map<string,{tree:string;parents:string[]}>(),pulls:Record<string,unknown>[]=[];
  const hash=(value:unknown)=>createHash('sha1').update(JSON.stringify(value)).digest('hex');
  const fetcher:typeof fetch=async(input,options)=>{
    const url=new URL(String(input));if(url.hostname!=='api.github.com')throw new Error('Unexpected synthetic destination');
    const path=decodeURIComponent(url.pathname.replace('/repos/example/project','')),method=options?.method??'GET',body=options?.body?JSON.parse(String(options.body)):null;
    if(method==='POST'){
      writes.push(path);
      if(path==='/git/blobs'){const sha=blobHash(body.content);blobs.set(sha,body.content);return Response.json({sha});}
      if(path==='/git/trees'){const inventory=source.inventory.map(file=>{const edit=body.tree.find((entry:{path:string})=>entry.path===file.path);return edit?{...file,sha:edit.sha,size:Buffer.byteLength(blobs.get(edit.sha)!)}:file;}),sha=hash(inventory);trees.set(sha,inventory);return Response.json({sha});}
      if(path==='/git/commits'){const sha=hash(body);commits.set(sha,{tree:body.tree,parents:body.parents});return Response.json({sha});}
      if(path==='/git/refs'){const branch=body.ref.replace('refs/heads/','');refs.set(branch,body.sha);return Response.json({ref:body.ref,object:{sha:body.sha}});}
      if(path==='/pulls'){const pull={number:pulls.length+1,html_url:`https://github.com/example/project/pull/${pulls.length+1}`,title:body.title,body:body.body,state:'open',merged_at:null,base:{ref:body.base,repo:{full_name:'example/project'}},head:{ref:body.head,sha:refs.get(body.head),repo:{full_name:'example/project'}}};pulls.push(pull);if(mode==='lost_response')throw new Error('Synthetic lost response after accepted PR');return Response.json(pull);}
      throw new Error('Unexpected synthetic write');
    }
    if(method!=='GET')throw new Error('Synthetic fixture rejects merge, deletion and branch reset');
    if(path==='')return Response.json({full_name:'example/project',archived:false,fork:false,permissions:{push:mode!=='denied'}});
    if(path.startsWith('/git/ref/heads/')){const branch=path.slice('/git/ref/heads/'.length),sha=refs.get(branch);return sha?Response.json({ref:'refs/heads/'+branch,object:{sha}}):new Response(null,{status:404});}
    if(path==='/pulls')return Response.json(pulls.filter((pull:any)=>pull.head.ref===url.searchParams.get('head')?.split(':')[1]));
    if(path.startsWith('/commits/agent/')){const sha=refs.get(path.slice('/commits/'.length)),commit=commits.get(sha!);return Response.json({sha,commit:{tree:{sha:commit?.tree}}});}
    if(path.startsWith('/git/commits/')){const sha=path.slice('/git/commits/'.length),commit=commits.get(sha);return Response.json({sha,parents:commit?.parents.map(sha=>({sha})),tree:{sha:commit?.tree}});}
    if(path.startsWith('/git/trees/')&&trees.has(path.slice('/git/trees/'.length))){const sha=path.slice('/git/trees/'.length);return Response.json({sha,truncated:false,tree:trees.get(sha)});}
    return codeSourceFetcher(input,options);
  };
  return {fetcher,writes,refs,pulls};
}
