import {describe,it,expect} from 'vitest';
import type {CodeInventoryEntry} from '@dev-project-agent/contracts';
import {coverageDefaults,validateCoverageSettings,exclusionReason,splitCoverageContent,localDependencies,coveragePriority} from './coverage-policy.js';
const entry=(path:string,size=10):CodeInventoryEntry=>({path,size,type:'blob',mode:'100644',sha:'a'.repeat(40)});
describe('progressive review safety and partitioning',()=>{
  it('distinguishes secrets, generated content, binaries, links and oversized files',()=>{
    expect(exclusionReason(entry('src/auth.ts'))).toBe(null);
    expect(exclusionReason(entry('.env.example'))).toBe('sensitive_path');
    expect(exclusionReason(entry('secrets/token.ts'))).toBe('sensitive_path');
    expect(exclusionReason(entry('node_modules/library/index.ts'))).toBe('generated_or_dependency');
    expect(exclusionReason(entry('public/icon.png'))).toBe('binary_or_unsupported');
    expect(exclusionReason({...entry('src/link.ts'),mode:'120000'})).toBe('link_or_submodule');
    expect(exclusionReason(entry('src/large.ts',1_000_001))).toBe('file_read_limit');
    expect(exclusionReason(entry('../src/app.ts'))).toBe('unsupported_path');
  });
  it('partitions UTF-8 by whole lines without silently dropping content',()=>{
    const content=Array.from({length:100},(_,index)=>`const value${index} = 'ñ🙂';`).join('\r\n');
    const parts=splitCoverageContent(content,1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map(part=>part.content).join('\n')).toBe(content.replace(/\r\n/g,'\n'));
    for(let index=0;index<parts.length;index++){
      expect(Buffer.byteLength(parts[index]!.content)).toBeLessThanOrEqual(1000);
      expect(parts[index]!.startLine).toBe(index?parts[index-1]!.endLine+1:1);
    }
    expect(()=>splitCoverageContent('x'.repeat(1001),1000)).toThrow();
  });
  it('resolves relative dependencies without treating remote imports as project files',()=>{
    expect(localDependencies('src/ui/app.ts',"import {x} from '../domain.js';\nconst y=require('./utils');\nimport z from 'external';",new Map([['src/domain.ts','a'],['src/ui/utils/index.ts','b']]))).toEqual({'src/domain.ts':'a','src/ui/utils/index.ts':'b'});
  });
  it('requires consent and enforces bounded settings including the local model budget',()=>{
    expect(()=>validateCoverageSettings(coverageDefaults)).not.toThrow();
    expect(()=>validateCoverageSettings({...coverageDefaults,withAi:true})).toThrow();
    expect(()=>validateCoverageSettings({...coverageDefaults,batchUnits:21})).toThrow();
    expect(()=>validateCoverageSettings({...coverageDefaults,withAi:true,consent:true,model:'ollama:example'})).toThrow();
    expect(()=>validateCoverageSettings({...coverageDefaults,partBytes:8000,contextBytes:4000,withAi:true,consent:true,model:'ollama:example'})).not.toThrow();
  });
  it('links Java imports and referenced types in the same package',()=>{
    const files=new Map([['backend/src/main/java/example/service/AccountService.java','a'],['backend/src/main/java/example/web/Request.java','b'],['backend/src/main/java/example/web/Unused.java','c']]);
    expect(localDependencies('backend/src/main/java/example/web/Controller.java','import example.service.AccountService;\nclass Controller { Request request; AccountService service; }',files)).toEqual({'backend/src/main/java/example/service/AccountService.java':'a','backend/src/main/java/example/web/Request.java':'b'});
  });
  it('prioritizes changed source and important code before documentation',()=>{
    expect(coveragePriority({path:'src/AuthController.java',state:'outdated'})).toBeGreaterThan(coveragePriority({path:'src/AuthController.java',state:'pending'}));
    expect(coveragePriority({path:'src/api.ts',state:'pending'})).toBeGreaterThan(coveragePriority({path:'AGENTS.md',state:'pending'}));
  });
});
