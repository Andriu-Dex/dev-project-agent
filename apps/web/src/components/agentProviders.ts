import type {OllamaOverview,ProviderOverview} from '@dev-project-agent/contracts';

export async function readAgentProviders(prefix:string,signal?:AbortSignal):Promise<ProviderOverview> {
  const [remote,local]=await Promise.all([
    fetch(prefix+'/chatgpt',signal?{signal}:{}),
    fetch(prefix+'/ollama',signal?{signal}:{}),
  ]);
  if(!remote.ok)throw new Error('No se pudieron consultar los proveedores.');
  const chatgpt=await remote.json() as ProviderOverview;
  const ollama=local.ok?await local.json() as OllamaOverview:null;
  const models=[...chatgpt.connection.models.filter(model=>!model.slug.startsWith('ollama:')).map(model=>({...model,displayName:'ChatGPT · '+model.displayName})),
    ...(ollama?.connection.status==='connected'?ollama.connection.models.filter(model=>('ollama:'+model.name).length<=100).map(model=>({slug:'ollama:'+model.name,displayName:'Ollama · '+model.name})):[])];
  return {...chatgpt,connection:{...chatgpt.connection,models,status:models.length?'connected':'disconnected'}};
}

export const providerDestination=(model:string|null|undefined)=>!model?'el proveedor seleccionado':model.startsWith('ollama:')?'Ollama configurado en el servidor':'ChatGPT (consume uso de tu plan)';
