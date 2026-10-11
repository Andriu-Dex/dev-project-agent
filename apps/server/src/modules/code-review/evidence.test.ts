import {describe,expect,it} from 'vitest';
import {applyPatch} from 'diff';
import {assertSafeCode,blobHash,readCodeCatalog,readCodeSource,validCodePath} from '../../integrations/github/code-client.js';
import {buildCandidate,deterministicAnalysis,parseAnalysis,parseCodeVerdict,syntaxChecks} from './evidence.js';
import {codeFixture,codeSourceFetcher,syntheticCodeVerdict,syntheticCorrection} from './fixtures.js';

describe('Pinned and bounded GitHub code sources',()=>{
  it.each(['../a.ts','/a.ts','.github/workflows/a.json','node_modules/a.js','src/credentials.json','src/private-key.ts','.env.json','package-lock.json','src/a.min.js','src/a.py','src/a\\b.ts'])('denies excluded path %s',path=>expect(validCodePath(path)).toBe(false));
  it('reads exact UTF-8 blobs, verifies their Git hash and permits only GET',async()=>{
    const source=codeFixture(),catalog=await readCodeCatalog(source.connection,null,codeSourceFetcher);
    expect(catalog.files[0]?.blobSha).toBe(blobHash(source.files[0]!.content));
    expect((await readCodeSource(source.connection,{paths:['src/parse.ts'],expectedHead:source.head,mode:'files',baseSha:null},null,codeSourceFetcher)).files).toEqual(source.files);
  });
  it('rejects changed HEAD, duplicate selections, identical comparisons and unselected changed paths',async()=>{
    const source=codeFixture(),request={paths:['src/parse.ts'],expectedHead:source.head,mode:'files' as const,baseSha:null};
    await expect(readCodeSource(source.connection,{...request,expectedHead:'c'.repeat(40)},null,codeSourceFetcher)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
    await expect(readCodeSource(source.connection,{...request,paths:[...request.paths,...request.paths]},null,codeSourceFetcher)).rejects.toMatchObject({code:'INVALID_SCOPE'});
    await expect(readCodeSource(source.connection,{...request,mode:'comparison',baseSha:source.head},null,codeSourceFetcher)).rejects.toMatchObject({code:'NO_CHANGED_FILES'});
    const compared=await readCodeSource(source.connection,{...request,mode:'comparison',baseSha:'c'.repeat(40)},null,codeSourceFetcher);expect(compared.mode).toBe('comparison');
  });
  it('rejects truncated trees and corrupted blob bytes',async()=>{
    const source=codeFixture(),request={paths:['src/parse.ts'],expectedHead:source.head,mode:'files' as const,baseSha:null};
    const truncated:typeof fetch=async(input,options)=>{const value=await codeSourceFetcher(input,options);return String(input).includes('/git/trees/')?Response.json({...await value.json(),truncated:true}):value;};
    await expect(readCodeCatalog(source.connection,null,truncated)).rejects.toMatchObject({code:'INCOMPLETE_SOURCE'});
    const corrupted:typeof fetch=async(input,options)=>{const value=await codeSourceFetcher(input,options);return String(input).includes('/git/blobs/')?Response.json({...await value.json(),content:Buffer.from('x'.repeat(source.files[0]!.size)).toString('base64')}):value;};
    await expect(readCodeSource(source.connection,request,null,corrupted)).rejects.toMatchObject({code:'INVALID_SOURCE'});
  });
  it('blocks recognizable secrets before storage or inference',()=>{for(const text of ['const token = "ghp_'+'a'.repeat(30)+'";','-----BEGIN RSA PRIVATE KEY-----','const password = "abcdefghijklmnop";','https://user:password@example.com'])expect(()=>assertSafeCode(text)).toThrow();});
});
describe('Evidence and bounded corrections',()=>{
  it('labels patterns as hypotheses and does not report unexecuted project tests as passed',()=>{
    const result=deterministicAnalysis(codeFixture());expect(result.findings[0]).toMatchObject({startLine:2,endLine:2,confidence:'hypothesis',evidence:'  return eval(input);'});
    expect(result.limitations.join(' ')).toContain('No se ejecutaron');const file={...codeFixture().files[0]!,path:'src/Main.java'};expect(syntaxChecks([file])[0]?.status).toBe('not_checked');
  });
  it('requires exact line evidence and marks all model findings as hypotheses',()=>{
    const source=codeFixture(),{id:ignored,origin:ignoredOrigin,confidence:ignoredConfidence,...finding}=deterministicAnalysis(source).findings[0]!,raw={summary:'Revisar la interpretación.',findings:[finding],limitations:['Falta contexto de los llamadores.']};
    expect(parseAnalysis(raw,source).findings[0]?.confidence).toBe('hypothesis');expect(()=>parseAnalysis({...raw,findings:[{...finding,evidence:'return eval(input);'}]},source)).toThrow();expect(()=>parseAnalysis({...raw,findings:[{...finding,path:'src/other.ts'}]},source)).toThrow();
  });
  it('builds a reversible exact diff without executing the candidate',()=>{
    const source=codeFixture(),candidate=buildCandidate(syntheticCorrection(source),source,deterministicAnalysis(source).findings);
    expect(applyPatch(source.files[0]!.content,candidate.patch)).toBe(candidate.files[0]!.content);expect(candidate.checks[0]?.status).toBe('pass');expect(candidate.patch).toContain('+  return JSON.parse(input);');
    const correction=syntheticCorrection(source);correction.edits[0]!.after='  return undefined;';expect(buildCandidate(correction,source,deterministicAnalysis(source).findings).patch).toContain('undefined');
  });
  it.each(['blob','before','outside','path','extra'])('rejects altered correction scope: %s',kind=>{
    const source=codeFixture(),correction=syntheticCorrection(source);if(kind==='blob')correction.edits[0]!.expectedBlob='c'.repeat(40);if(kind==='before')correction.edits[0]!.before='return eval(input);';if(kind==='outside'){correction.edits[0]!.startLine=1;correction.edits[0]!.endLine=1;}if(kind==='path')correction.edits[0]!.path='../escape.ts';if(kind==='extra')correction.findingIds.push('f-'+'0'.repeat(16));expect(()=>buildCandidate(correction,source,deterministicAnalysis(source).findings)).toThrow();
  });
  it('blocks positive verdicts for wrong hashes, failed syntax, unanswered questions or automated permission',()=>{
    const source=codeFixture(),candidate=buildCandidate(syntheticCorrection(source),source,deterministicAnalysis(source).findings),hash='a'.repeat(64);
    expect(parseCodeVerdict(syntheticCodeVerdict('approver',hash),'approver',hash,candidate).verdict).toBe('human_required');
    expect(()=>parseCodeVerdict({...syntheticCodeVerdict('approver',hash),verdict:'policy_allowed'},'approver',hash,candidate)).toThrow();
    expect(()=>parseCodeVerdict(syntheticCodeVerdict('reviewer',hash),'reviewer','b'.repeat(64),candidate)).toThrow();
    candidate.correction.unresolvedQuestions=['Falta aclarar el contrato.'];expect(()=>parseCodeVerdict(syntheticCodeVerdict('reviewer',hash),'reviewer',hash,candidate)).toThrow();candidate.correction.unresolvedQuestions=[];candidate.checks[0]!.status='fail';expect(()=>parseCodeVerdict(syntheticCodeVerdict('reviewer',hash),'reviewer',hash,candidate)).toThrow();
  });
  it('preserves CRLF source and explicitly reports invalid syntax',()=>{
    const source=codeFixture();source.files[0]!.content=source.files[0]!.content.replace(/\n/g,'\r\n');source.files[0]!.blobSha=blobHash(source.files[0]!.content);const candidate=buildCandidate(syntheticCorrection(source),source,deterministicAnalysis(source).findings);expect(candidate.files[0]!.content).toContain('\r\n');expect(syntaxChecks([{...source.files[0]!,content:'export function broken( {'}])[0]?.status).toBe('fail');
  });
  it('rejects a correction that claims multiple findings but leaves one selected file untouched',()=>{
    const source=codeFixture();source.files.push({...source.files[0]!,path:'src/other.ts'});const selected=deterministicAnalysis(source).findings;
    const correction=syntheticCorrection(source,selected);expect(correction.findingIds).toHaveLength(2);expect(()=>buildCandidate(correction,source,selected)).toThrow();
  });
});
