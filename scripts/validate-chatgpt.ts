import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {authorizationUrl,callbackCredentials,exchangeSignIn,newAttempt,ProviderValidationError,validateInference} from '../apps/server/src/providers/chatgpt/validation.js';

const directory=new URL('../work/provider-validation/',import.meta.url);await mkdir(directory,{recursive:true});
const metadataFile=new URL('chatgpt-registration.json',directory);
let metadata:{hostId:string;clientId:string|null;subject:string|null};
try{metadata=JSON.parse(await readFile(metadataFile,'utf8'));if(!/^urn:uuid:[a-f0-9-]{36}$/.test(metadata.hostId))throw new Error('Invalid saved host identifier.');}
catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;metadata={hostId:'urn:uuid:'+randomUUID(),clientId:null,subject:null};await writeFile(metadataFile,JSON.stringify(metadata),{mode:0o600,flag:'wx'});}
let attempt:ReturnType<typeof newAttempt>;let consumed=false;
let settle:(value:{clientId:string;code:string})=>void,fail:(error:unknown)=>void;
const callback=new Promise<{clientId:string;code:string}>((resolve,reject)=>{settle=resolve;fail=reject;});
const server=createServer((request,response)=>{
  response.setHeader('Content-Security-Policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'");response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','text/html; charset=utf-8');response.setHeader('Referrer-Policy','no-referrer');
  if(request.method!=='GET'||request.headers.host!==new URL(attempt.redirectUri).host){response.writeHead(400);response.end('Solicitud no válida.');return;}
  const url=new URL(request.url??'/',attempt.redirectUri);
  if(url.pathname==='/'){
    response.end(`<html lang="es"><meta charset="utf-8"><title>Conectar ChatGPT</title><h1>Validar ChatGPT para dev-project-agent</h1><p>Se comprobará el acceso con una solicitud sintética pequeña. No se enviarán datos de UTAPED. Los tokens permanecerán en memoria durante esta prueba.</p><a href="${authorizationUrl(attempt,metadata.hostId).toString().replaceAll('&','&amp;')}">Continue with ChatGPT</a></html>`);return;
  }
  if(url.pathname!=='/auth/callback'||consumed){response.writeHead(404);response.end('Esta solicitud no está disponible.');return;}
  try{const credentials=callbackCredentials(url,attempt);consumed=true;settle(credentials);response.end('Inicio de sesión recibido. Puedes volver al proyecto; la prueba continuará en la terminal.');}
  catch(error){response.writeHead(400);response.end('No se pudo validar el inicio de sesión. Vuelve a la terminal.');if(error instanceof ProviderValidationError&&error.code!=='INVALID_STATE'){consumed=true;fail(error);}}
});
await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const address=server.address();if(!address||typeof address==='string')throw new Error('Callback listener failed.');
attempt=newAttempt(`http://127.0.0.1:${address.port}/auth/callback`,metadata.clientId,metadata.subject);
const timeout=setTimeout(()=>fail(new ProviderValidationError('AUTHORIZATION_TIMEOUT')),300_000);
console.log(`Open http://127.0.0.1:${address.port}/ and choose Continue with ChatGPT.`);
console.log('This validation uses a small synthetic request. Project data is not sent. Credentials are not printed or persisted.');
try{
  const credentials=await callback;clearTimeout(timeout);
  const identity=await exchangeSignIn(attempt,credentials);
  metadata={...metadata,clientId:credentials.clientId,subject:identity.subject};await writeFile(metadataFile,JSON.stringify(metadata),{mode:0o600});
  const result=await validateInference(identity.accessToken);
  await writeFile(new URL('chatgpt-result.json',directory),JSON.stringify({...result,validatedAt:new Date().toISOString()},null,2),{mode:0o600});
  console.log(`Validation passed: ${result.model}, ${result.durationMs} ms, completed inference with valid structured output.`);
}catch(error){
  const code=error instanceof ProviderValidationError?error.code:'VALIDATION_FAILED';console.error(`Validation failed: ${code}. No credentials were printed.`);process.exitCode=1;
}finally{clearTimeout(timeout);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
