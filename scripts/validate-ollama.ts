import {mkdir,writeFile} from 'node:fs/promises';
import {OllamaService} from '../apps/server/src/providers/ollama/service.js';

const baseUrl=process.env.OLLAMA_BASE_URL??'http://127.0.0.1:11434';
const dummyDb={query:async()=>({rows:[]}),connect:async()=>({query:async()=>({rows:[]}),release:()=>{}})} as any;
const service=new OllamaService({database:dummyDb,baseUrl});

const directory=new URL('../work/provider-validation/',import.meta.url);
await mkdir(directory,{recursive:true});

console.log(`Checking connection to Ollama at ${baseUrl}...`);
const health=await service.healthCheck();
if(health.status!=='connected'){
  console.error(`Ollama is unavailable at ${baseUrl}. Ensure Ollama is running.`);
  process.exit(1);
}

const models=await service.listModels();
console.log(`Detected ${models.length} model(s): ${models.map(m=>m.name).join(', ')}`);

const preferredModel=models.find(m=>m.name==='qwen2.5-coder:7b')?.name??models[0]?.name;
if(!preferredModel){
  console.error('No models found in Ollama. Run ollama pull <model> first.');
  process.exit(1);
}

console.log(`Running synthetic validation inference with model: ${preferredModel}...`);
const result=await service.generate(
  preferredModel,
  'Return only valid JSON with status="ok" and engine="ollama".',
  'Return exactly this JSON: {"status":"ok","engine":"ollama"}'
);

if(!result.output||typeof result.output!=='object'||!('status' in result.output)||result.output.status!=='ok'||!('engine' in result.output)||result.output.engine!=='ollama')throw new Error('Synthetic output did not match the expected contract.');
console.log(`Validation succeeded in ${result.durationMs} ms!`);
console.log('Parsed model output:', JSON.stringify(result.output));

await writeFile(
  new URL('ollama-result.json',directory),
  JSON.stringify({
    model:preferredModel,
    durationMs:result.durationMs,
    usage:result.usage,
    output:result.output,
    validatedAt:new Date().toISOString(),
  },null,2),
  {mode:0o600}
);

console.log('Validation evidence saved to work/provider-validation/ollama-result.json.');
