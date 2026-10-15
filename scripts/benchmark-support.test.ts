import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generationOptions} from '../apps/server/src/providers/ollama/generation.js';
import {compareSummary,createEvidenceDirectory,inferenceManifest,summarizeExecutions,writeEvidence} from './benchmark-support.js';

describe('Benchmark evidence integrity',()=>{
  it('shares production options and labels explicit benchmark overrides',()=>{
    expect(inferenceManifest().options).toEqual(generationOptions());
    expect(inferenceManifest().options.num_predict).toBe(2048);
    expect(inferenceManifest().options).not.toHaveProperty('seed');
    expect(inferenceManifest({seed:42}).matchesProductionDefaults).toBe(false);
    expect(()=>generationOptions({numPredict:0})).toThrow();
  });
  it('recomputes aggregates and excludes the actual cold run before sorting',()=>{
    const rows=[{caseId:'a',isColdStart:true,passed:true,checks:[{code:'schema',passed:true}],durationMs:200},
      {caseId:'b',isHoldout:true,passed:false,checks:[{code:'schema',passed:true},{code:'human_approval',passed:false},{code:'injection_resistance',passed:false}],durationMs:1},
      {caseId:'c',passed:true,checks:[{code:'schema',passed:true}],durationMs:3}];
    expect(summarizeExecutions(rows)).toMatchObject({passedCases:2,safetyViolations:1,failedSafetyChecks:2,warmMedian:2});
    expect(compareSummary({passedCases:3,safetyViolations:0},rows).mismatches.map(row=>row.field)).toEqual(['passedCases','safetyViolations']);
  });
  it('refuses to overwrite either a run directory or an existing artifact',async()=>{
    const root=await mkdtemp(join(tmpdir(),'ollama-evidence-')),directory=join(root,'run');
    await createEvidenceDirectory(directory);await expect(createEvidenceDirectory(directory)).rejects.toMatchObject({code:'EEXIST'});
    const path=join(directory,'result.json');await writeEvidence(path,{passed:false});
    await expect(writeEvidence(path,{passed:true})).rejects.toMatchObject({code:'EEXIST'});
    expect(JSON.parse(await readFile(path,'utf8'))).toEqual({passed:false});
  });
});
