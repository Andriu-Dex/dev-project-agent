import type {CodeSource,CodeCorrection,CodeFinding,AgentVerdict} from '@dev-project-agent/contracts';
import {blobHash} from '../../integrations/github/code-client.js';
import {codeChecks,deterministicAnalysis} from './evidence.js';
export const syntheticHead='a'.repeat(40),syntheticTree='b'.repeat(40);
export function codeFixture():CodeSource {
  const content='export function parse(input: string) {\n  return eval(input);\n}\n',blobSha=blobHash(content),file={path:'src/parse.ts',blobSha,mode:'100644',size:Buffer.byteLength(content),content};
  return {schemaVersion:1,connection:{owner:'example',repository:'project',branch:'develop'},head:syntheticHead,treeSha:syntheticTree,observedAt:new Date().toISOString(),mode:'files',baseSha:null,files:[file],inventory:[{path:file.path,type:'blob',mode:file.mode,sha:blobSha,size:file.size}]};
}
export function syntheticCorrection(source=codeFixture(),findings:CodeFinding[]=deterministicAnalysis(source).findings):CodeCorrection {
  return {objective:'Corregir la interpretación del contenido seleccionado.',justification:'Se propone limitar el formato admitido a JSON y evitar ejecución dinámica.',impact:'Las entradas no válidas producirán un error de análisis; requiere comprobar el contrato del llamador.',risks:['La compatibilidad con los llamadores todavía necesita pruebas del proyecto.'],verificationPlan:'Comprobar la sintaxis aislada del diff. No se ejecutaron builds ni pruebas del proyecto. Tras una publicación futura verificar rama, commit y PR.',recoveryPlan:'Proponer una nueva corrección revisada; no revertir ni integrar automáticamente.',unresolvedQuestions:[],findingIds:findings.map(item=>item.id),edits:[{path:source.files[0]!.path,expectedBlob:source.files[0]!.blobSha,startLine:2,endLine:2,before:'  return eval(input);',after:'  return JSON.parse(input);'}]};
}
export function syntheticCodeVerdict(stage:'reviewer'|'approver',hash:string):AgentVerdict {return {contentHash:hash,verdict:stage==='reviewer'?'validated':'human_required',summary:'Corrección acotada; faltan las pruebas del proyecto y la decisión del gestor.',issues:[],checks:codeChecks[stage].map(code=>({code,status:'pass',reason:'Cumple el alcance de preparación; no acredita ejecución ni integración.'}))};}
export const codeSourceFetcher:typeof fetch=async(input,options)=>{
  if((options?.method??'GET')!=='GET')throw new Error('Synthetic code fixture prohibits external writes.');
  const url=new URL(String(input)),source=codeFixture();
  if(url.pathname.includes('/commits/'))return Response.json({sha:source.head,commit:{tree:{sha:source.treeSha}}});
  if(url.pathname.includes('/git/trees/'))return Response.json({sha:source.treeSha,truncated:false,tree:source.inventory});
  if(url.pathname.includes('/git/blobs/'))return Response.json({sha:source.files[0]!.blobSha,encoding:'base64',size:source.files[0]!.size,content:Buffer.from(source.files[0]!.content).toString('base64')});
  if(url.pathname.includes('/compare/'))return Response.json({status:'ahead',files:[{filename:source.files[0]!.path,status:'modified'}]}, {headers:{link:'<https://api.github.com/synthetic-next>; rel="next"'}});
  return Response.json({message:'Not found'},{status:404});
};
