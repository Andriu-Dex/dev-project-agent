import {useCallback,useEffect,useRef,useState} from 'react';
import type {ProjectAccess,ProviderOverview,ReasoningEffort} from '@dev-project-agent/contracts';
import {ReasoningSelect,effortLabels} from './ReasoningSelect';

const statuses={disconnected:'Sin conectar',pending:'Esperando autorización',connected:'Conectado',expired:'Conexión vencida',failed:'Conexión no completada'};
const evaluationStatuses={running:'En ejecución',passed:'Comprobaciones superadas',failed:'Requiere revisión',interrupted:'Interrumpida'};
const checks:Record<string,string>={schema:'Formato',case_binding:'Caso correcto',classification:'Clasificación',evidence:'Evidencia',human_approval:'Aprobación humana',uncertainty:'Datos desconocidos'};
const classifications={overdue:'Vencida',completed:'Completada declarada',on_schedule:'Vencimiento futuro',insufficient_data:'Datos insuficientes'};
const errors:Record<string,string>={USAGE_LIMIT:'ChatGPT alcanzó un límite de uso. Espera antes de volver a evaluar.',AUTHORIZATION_EXPIRED:'La conexión venció. Vuelve a conectar ChatGPT.',SERVICE_RESTARTED:'El servicio se reinició. La evaluación no se repite automáticamente.',CONNECTION_REQUIRED:'Conecta ChatGPT antes de evaluar.',FORBIDDEN:'Los permisos del gestor cambiaron.',INVALID_MODEL_OUTPUT:'La respuesta no cumple el formato requerido.',PLAN_PERMISSION_MISSING:'La autorización no incluye el uso del plan.',AUTHORIZATION_DENIED:'Se canceló la autorización.',IDENTITY_MISMATCH:'La cuenta seleccionada no coincide con la vinculada.',AUTHORIZATION_CANCELLED:'Se cambió o canceló la conexión durante la prueba.'};
const renewalErrors:Record<string,string>={REFRESH_UNCERTAIN:'Una renovación quedó sin confirmación. Conecta ChatGPT otra vez para recuperar el acceso.',REFRESH_REAUTHORIZATION_REQUIRED:'ChatGPT revocó o venció el acceso renovable. Vuelve a conectar.',REFRESH_UNAVAILABLE:'La renovación está temporalmente indisponible; se conserva el acceso y se reintentará con espera.',REFRESH_IN_PROGRESS:'Se está renovando el acceso. Espera unos instantes.',CREDENTIAL_STORAGE_UNAVAILABLE:'No se pudo abrir el acceso protegido. Revisa la configuración local antes de reconectar.',INVALID_CLIENT:'La vinculación de la aplicación requiere revisión antes de reconectar.'};
const explain=(code:string)=>errors[code]??renewalErrors[code]??'No se pudo completar la prueba. Revisa la conexión y vuelve a intentar.';
const date=(value:string)=>new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'});

export function ProviderPanel({project,csrfToken}:{project:ProjectAccess;csrfToken:string}) {
  const [data,setData]=useState<ProviderOverview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [authorization,setAuthorization]=useState<{url:string;expiresAt:string}|null>(null);
  const [model,setModel]=useState(''),[consent,setConsent]=useState(false),[refresh,setRefresh]=useState(0);
  const [effort,setEffort]=useState<ReasoningEffort|''>('');
  const requestKey=useRef<{selection:string;key:string}|null>(null);
  const prefix=`/api/v1/projects/${project.id}/chatgpt`;
  useEffect(()=>{if(effort&&!data?.connection.models.find(value=>value.slug===model)?.reasoningEfforts?.includes(effort)){setEffort('');setConsent(false);}},[data?.connection.models,model,effort]);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(prefix,signal?{signal}:{});if(!response.ok)throw new Error('Provider state is unavailable.');
    const next=await response.json() as ProviderOverview;if(signal?.aborted)return;
    setLoadError('');setData(next);setModel(previous=>next.connection.models.some(value=>value.slug===previous)?previous:next.connection.models[0]?.slug??'');
    if(next.connection.status!=='pending')setAuthorization(null);
  },[prefix]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setLoadError('No se pudo consultar ChatGPT. Actualiza el panel.');});return()=>controller.abort();},[load,refresh]);
  const running=data?.evaluations.some(value=>value.status==='running')??false;
  const polling=data?.connection.status==='pending'||data?.connection.status==='connected'||running;
  useEffect(()=>{
    if(!polling)return;const controller=new AbortController();let loading=false;
    const timer=setInterval(()=>{if(loading)return;loading=true;void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setLoadError('No se pudo actualizar el estado. Puedes consultar de nuevo.');}).finally(()=>{loading=false;});},running||data?.connection.status==='pending'?2500:15000);
    return()=>{clearInterval(timer);controller.abort();};
  },[load,polling,running,data?.connection.status]);
  async function action(kind:'authorization'|'disconnect'|'evaluations') {
    if(busy)return;setBusy(true);setError('');
    const selection=JSON.stringify({model,effort});
    if(kind==='evaluations'&&requestKey.current?.selection!==selection)requestKey.current={selection,key:crypto.randomUUID()};
    try{
      const response=await fetch(prefix+'/'+kind,{method:'POST',headers:{'x-csrf-token':csrfToken,...(kind==='evaluations'?{'Content-Type':'application/json'}:{})},...(kind==='evaluations'?{body:JSON.stringify({model,...(effort?{reasoningEffort:effort}:{}),requestKey:requestKey.current!.key})}:{})});
      if(response.status===204){setAuthorization(null);setConsent(false);if(response.headers.get('X-Remote-Revocation-Confirmed')!=='true')setError('Se eliminó el acceso local. No se pudo confirmar la revocación remota; puedes desconectar la aplicación desde la configuración de ChatGPT.');}
      else{
        const body=await response.json();if(!response.ok){setError(body.message??'No se pudo completar la operación.');return;}
        if(kind==='authorization'){
          const url=new URL(body.authorizationUrl);if(url.origin!=='https://auth.openai.com')throw new Error('Invalid authorization destination.');
          setAuthorization({url:url.toString(),expiresAt:body.expiresAt});
        }else if(kind==='evaluations'){requestKey.current=null;setConsent(false);}
      }
      setRefresh(value=>value+1);
    }catch{setError('No se pudo confirmar la solicitud. Actualiza el panel antes de volver a intentar.');}
    finally{setBusy(false);}
  }
  return <section aria-labelledby="provider-title" className="provider-panel">
    <div className="section-heading"><h2 id="provider-title">ChatGPT y evaluación del proveedor</h2><button onClick={()=>{setError('');setRefresh(value=>value+1);}} disabled={busy}>Actualizar conexión</button></div>
    <p className="muted">Evalúa el proveedor con seis casos sintéticos de seguimiento. Esta prueba no envía datos de UTAPED y puede consumir uso de tu plan de ChatGPT.</p>
    {(error||loadError)&&<p role="alert" className="form-error">{error||loadError}</p>}
    {!data?<p role="status">Consultando proveedor…</p>:<>
      {project.canManageProject?<>
        <p role="status">Estado: <strong>{statuses[data.connection.status]}</strong>{data.connection.status==='connected'&&data.connection.expiresAt&&` · Disponible hasta ${date(data.connection.expiresAt)}`}</p>
        {data.connection.errorCode&&<p className="form-error">{explain(data.connection.errorCode)}</p>}
        <p className="muted">{data.connection.renewable?'Renovación automática activa. Las credenciales se conservan cifradas y sobreviven al cierre de sesión del panel y al reinicio del servicio.':'La conexión actual no tiene acceso renovable guardado. Conecta ChatGPT para habilitar la renovación automática.'} Desconectar ChatGPT elimina el acceso guardado e intenta revocarlo en el proveedor. Los cambios externos conservan sus requisitos de aprobación.</p>
        {data.connection.lastRefreshedAt&&<p className="muted">Última renovación: {date(data.connection.lastRefreshedAt)}.</p>}
        {data.connection.retryAt&&<p className="muted">Próximo intento de renovación: {date(data.connection.retryAt)}. Un fallo temporal conserva el acceso guardado.</p>}
        <div className="supervision-actions">
          <button onClick={()=>void action('authorization')} disabled={busy||running||data.connection.status==='pending'}>{data.connection.status==='connected'?'Volver a conectar ChatGPT':'Conectar con ChatGPT'}</button>
          {['pending','connected'].includes(data.connection.status)&&<button onClick={()=>void action('disconnect')} disabled={busy}>Desconectar ChatGPT</button>}
        </div>
        {authorization&&data.connection.status==='pending'&&<div className="provider-authorization"><p>Completa la autorización antes de {date(authorization.expiresAt)}. El estado se actualizará aquí al terminar.</p><a href={authorization.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Continue with ChatGPT</a></div>}
        {data.connection.status==='connected'&&<div className="provider-evaluation-form">
          <label htmlFor="provider-model">Modelo de tu cuenta</label><select id="provider-model" value={model} onChange={event=>{setModel(event.target.value);setEffort('');setConsent(false);}} disabled={busy||running}>{data.connection.models.map(value=><option key={value.slug} value={value.slug}>{value.displayName}</option>)}</select>
          <ReasoningSelect id="provider-effort" model={data.connection.models.find(value=>value.slug===model)} value={effort} onChange={value=>{setEffort(value);setConsent(false);}} disabled={busy||running}/>
          <label className="confirmation"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy||running}/>Quiero enviar los seis casos sintéticos usando mi plan de ChatGPT.</label>
          <button onClick={()=>void action('evaluations')} disabled={busy||running||!consent||!model}>{running?'Evaluando casos…':'Evaluar proveedor'}</button>
        </div>}
      </>:<p className="muted">Solo el gestor puede conectar ChatGPT e iniciar pruebas. Puedes consultar las evaluaciones guardadas del proyecto.</p>}
      <h3>Evaluaciones recientes</h3>
      {!data.evaluations.length&&<p>Aún no hay evaluaciones de calidad guardadas. La prueba inicial de acceso no sustituye estas evaluaciones.</p>}
      <div className="work-items">{data.evaluations.map(evaluation=><article key={evaluation.id} className="work-item">
        <h4>{evaluationStatuses[evaluation.status]} · {evaluation.model}</h4><p>{date(evaluation.createdAt)} · Razonamiento: {evaluation.reasoningEffort?effortLabels[evaluation.reasoningEffort]:'Predeterminado'}</p>
        {evaluation.status==='running'&&<p role="status">Ejecutando los casos en secuencia. No cierres sesión ni desconectes para completar la prueba.</p>}
        {evaluation.errorCode&&<p className="form-error">{explain(evaluation.errorCode)}</p>}
        {evaluation.result&&<><p><strong>{evaluation.result.passed} de {evaluation.result.total}</strong> casos superaron las comprobaciones automáticas. Revisión humana pendiente; este resultado no habilita cambios externos.</p>
          <details><summary>Ver casos y respuestas</summary>{evaluation.result.cases.map(test=><div key={test.caseId} className="provider-case">
            <h5>{test.title} · {test.passed?'Superado':'Revisar'}</h5><p>{(test.durationMs/1000).toLocaleString('es-EC')} s{test.usage?.total_tokens!==undefined&&` · ${test.usage.total_tokens} tokens`}</p>
            <ul>{test.checks.map(check=><li key={check.code}>{checks[check.code]??check.code}: {check.passed?'Correcto':'No superado'}</li>)}</ul>
            {test.output&&<><p>{classifications[test.output.classification]} · Evidencia: {test.output.evidenceIds.join(', ')}</p><p>{test.output.recommendation}</p>{test.output.unknowns.length>0&&<><p>Datos desconocidos:</p><ul>{test.output.unknowns.map((value,index)=><li key={index}>{value}</li>)}</ul></>}</>}
            {test.errorCode&&<p>{explain(test.errorCode)}</p>}
          </div>)}</details></>}
      </article>)}</div>
    </>}
  </section>;
}
