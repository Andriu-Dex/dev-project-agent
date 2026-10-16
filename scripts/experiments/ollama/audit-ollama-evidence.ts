import {readdir,readFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {compareSummary,createEvidenceDirectory,digest,writeEvidence} from './benchmark-support.js';

const root='work/provider-validation';
const findings=[];
for(const entry of await readdir(root,{withFileTypes:true})) {
  if(!entry.isDirectory()||entry.name.startsWith('audit-'))continue;
  const directory=join(root,entry.name);
  for(const name of await readdir(directory)) {
    if(!/^model-.+-summary\.json$/.test(name))continue;
    const summaryPath=join(directory,name),rawPath=summaryPath.replace(/-summary\.json$/,'-raw.json');
    try {
      const [summaryText,rawText]=await Promise.all([readFile(summaryPath,'utf8'),readFile(rawPath,'utf8')]);
      const summary=JSON.parse(summaryText),raw=JSON.parse(rawText);
      const comparison=compareSummary(summary,raw);
      const consolidatedText=await readFile(join(directory,'benchmark-summary.json'),'utf8');
      const consolidated=JSON.parse(consolidatedText).models.find((row:{model:string})=>row.model===summary.model);
      const consolidatedComparison=consolidated?compareSummary(consolidated,raw):{mismatches:[{field:'model',recorded:null,computed:summary.model}]};
      findings.push({run:entry.name,modelFile:basename(summaryPath),sourceDigests:{summary:digest(summaryText),raw:digest(rawText),consolidated:digest(consolidatedText)},consolidatedMismatches:consolidatedComparison.mismatches,...comparison});
    }catch {findings.push({run:entry.name,modelFile:name,error:'MISSING_OR_INVALID_EVIDENCE'});}
  }
}
const directory=join(root,'audit-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
await createEvidenceDirectory(directory);
await writeEvidence(join(directory,'evidence-audit.json'),{observedAt:new Date().toISOString(),scope:'Stored checks only; no regrading or inference. Original files unchanged.',findings});
console.log(JSON.stringify({directory,models:findings.length,inconsistent:findings.filter(row=>'error' in row||row.mismatches.length||row.consolidatedMismatches.length||row.computed.inconsistentCaseFlags).length}));
