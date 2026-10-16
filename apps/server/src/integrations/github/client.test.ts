import { describe, expect, it, vi } from 'vitest';
import { GitHubError, githubToken, readRepository } from './client.js';
const head='a'.repeat(40),base='b'.repeat(40);
const connection={owner:'example',repository:'project',branch:'develop'};
function commit() { return {sha:head,commit:{message:'Example change\nprivate body',author:{name:'Test member'},committer:{date:'2026-10-11T10:00:00Z'}}}; }
function file() { return {filename:'src/example.ts',status:'modified',additions:2,deletions:1,patch:'@@ -2,1 +2,2 @@\n-old\n+private source\n+new'}; }
function adapter(values:unknown[]) { return vi.fn<typeof fetch>().mockImplementation(async()=>Response.json(values.shift())); }
function initial() { return [{full_name:'example/project',default_branch:'main'},[{name:'develop',commit:{sha:head}}],[commit()],{files:[file()]}]; }
describe('Read-only GitHub source',()=>{
  it('pins revisions, bounds history and stores file ranges without source content',async()=>{
    const fetcher=adapter(initial());const token='github_pat_'+'t'.repeat(30);
    const result=await readRepository(connection,null,token,fetcher);
    expect(result).toMatchObject({head,base:null,comparison:'initial_commit',files:[{path:'src/example.ts',hunks:[{startLine:2,lineCount:2}]}]});
    expect(JSON.stringify(result)).not.toContain('private source');expect(JSON.stringify(result)).not.toContain('private body');
    expect(String(fetcher.mock.calls[2]![0])).toContain('sha='+head);
    for(const [url,options] of fetcher.mock.calls){expect(new URL(String(url)).host).toBe('api.github.com');expect(String(url)).not.toContain(token);expect(options?.method).toBe('GET');expect(options?.redirect).toBe('error');}
  });
  it('paginates branches and commit files without following untrusted link hosts',async()=>{
    let calls=0;
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>{
      calls++;
      if(calls===1)return Response.json({full_name:'example/project',default_branch:'main'});
      if(calls===2)return Response.json([{name:'main',commit:{sha:base}}],{headers:{link:'<https://untrusted.example/leak>; rel="next"'}});
      if(calls===3)return Response.json([{name:'develop',commit:{sha:head}}]);
      if(calls===4)return Response.json([commit()]);
      if(calls===5)return Response.json({files:[file()]},{headers:{link:'<https://untrusted.example/leak>; rel="next"'}});
      return Response.json({files:[{...file(),filename:'src/other.ts'}]});
    });
    const result=await readRepository(connection,null,null,fetcher);expect(result.branches).toHaveLength(2);expect(result.files).toHaveLength(2);
    expect(fetcher.mock.calls.every(([url])=>new URL(String(url)).host==='api.github.com')).toBe(true);
  });
  it('does not request files when the pinned head is unchanged',async()=>{
    const fetcher=adapter(initial().slice(0,3));const result=await readRepository(connection,head,null,fetcher);
    expect(result.comparison).toBe('unchanged');expect(result.files).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('rejects potentially truncated comparisons and reports diverging history',async()=>{
    const responses=initial();responses[3]={status:'diverged',files:[file()]};
    expect((await readRepository(connection,base,null,adapter(responses))).comparison).toBe('diverged');
    const oversized=initial();oversized[3]={status:'ahead',files:Array(300).fill(file())};
    await expect(readRepository(connection,base,null,adapter(oversized))).rejects.toMatchObject({code:'COMPARISON_TOO_LARGE'});
  });
  it('sanitizes errors, enforces fixed resources and rejects incomplete data',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive provider response',{status:403,headers:{'x-ratelimit-remaining':'0'}}));
    await expect(readRepository(connection,null,null,fetcher)).rejects.toMatchObject({code:'RATE_LIMITED',message:'GitHub source could not be read.'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();await expect(readRepository({...connection,owner:'../bad'},null,null,fetcher)).rejects.toBeInstanceOf(GitHubError);expect(fetcher).not.toHaveBeenCalled();
    const incomplete=initial();incomplete[2]=[{...commit(),sha:base}];await expect(readRepository(connection,null,null,adapter(incomplete))).rejects.toMatchObject({code:'INCOMPLETE_SOURCE'});
    expect(githubToken({})).toBeNull();expect(()=>githubToken({GITHUB_TOKEN:'bad\nheader'})).toThrow();
  });
});
