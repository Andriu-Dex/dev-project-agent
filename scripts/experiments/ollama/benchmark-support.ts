import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {generationOptions,OLLAMA_GENERATION_VERSION,OLLAMA_TIMEOUT_MS,type GenerationSettings} from '../../../apps/server/src/providers/ollama/generation.js';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function createEvidenceDirectory(directory:string) {
  await mkdir(dirname(directory),{recursive:true});
  // Never reuse a completed or partial run directory, even with an explicit run ID.
  await mkdir(directory);
}
export async function implementationManifest(paths:string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async path=>[path,digest(await readFile(path,'utf8'))])));
}
export function inferenceManifest(settings:GenerationSettings={}) {
  const options=generationOptions(settings);
  return {version:OLLAMA_GENERATION_VERSION,options,timeoutMs:OLLAMA_TIMEOUT_MS,stream:false,
    matchesProductionDefaults:JSON.stringify(options)===JSON.stringify(generationOptions())};
}
export async function writeEvidence(path:string,value:unknown) {
  await writeFile(path,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});
}

interface Check {code:string;passed:boolean}
interface Execution {caseId:string;isHoldout?:boolean;passed:boolean;checks:Check[];durationMs:number;isColdStart?:boolean}
const safetyCodes=new Set(['safety_no_execution_claim','human_approval','injection_resistance']);
export function safetyFailureCount(checks:Check[]) {return checks.filter(check=>safetyCodes.has(check.code)&&!check.passed).length;}
export function summarizeExecutions(rows:Execution[]) {
  const warm=rows.filter(row=>!row.isColdStart).map(row=>row.durationMs).sort((a,b)=>a-b);
  const middle=Math.floor(warm.length/2);
  return {totalExecutions:rows.length,passedCases:rows.filter(row=>row.passed).length,
    totalChecks:rows.reduce((sum,row)=>sum+row.checks.length,0),passedChecks:rows.reduce((sum,row)=>sum+row.checks.filter(check=>check.passed).length,0),
    holdoutExecutions:rows.filter(row=>row.isHoldout).length,passedHoldouts:rows.filter(row=>row.isHoldout&&row.passed).length,
    safetyViolations:rows.filter(row=>safetyFailureCount(row.checks)>0).length,
    failedSafetyChecks:rows.reduce((sum,row)=>sum+safetyFailureCount(row.checks),0),
    inconsistentCaseFlags:rows.filter(row=>row.passed!==row.checks.every(check=>check.passed)).length,
    warmMedian:warm.length?(warm.length%2?warm[middle]!:(warm[middle-1]!+warm[middle]!)/2):null};
}

export function compareSummary(summary:Record<string,unknown>,rows:Execution[]) {
  const computed=summarizeExecutions(rows);
  const fields=['totalExecutions','passedCases','totalChecks','passedChecks','holdoutExecutions','passedHoldouts','safetyViolations'] as const;
  return {computed,mismatches:fields.filter(key=>summary[key]!==undefined&&summary[key]!==computed[key]).map(key=>({field:key,recorded:summary[key],computed:computed[key]}))};
}
