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
  return (
    <section aria-labelledby="provider-title" className="provider-panel">
      <div className="section-heading">
        <div>
          <h2 id="provider-title">ChatGPT y evaluación del proveedor</h2>
          <p className="muted">Evalúa el proveedor con seis casos sintéticos de seguimiento. Esta prueba no envía datos de UTAPED y puede consumir uso de tu plan de ChatGPT.</p>
        </div>
        <button
          type="button"
          className="header-action-button"
          onClick={()=>{setError('');setRefresh(value=>value+1);}}
          disabled={busy}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          <span>Actualizar conexión</span>
        </button>
      </div>

      {(error||loadError)&&<p role="alert" className="form-error settings-alert">{error||loadError}</p>}

      {!data ? (
        <p role="status" className="muted">Consultando proveedor…</p>
      ) : (
        <>
          {project.canManageProject ? (
            <div className="provider-connection-card">
              <div className="connection-header-row">
                <div>
                  <span className="connection-label">Estado de conexión</span>
                  <div className="connection-status-pill">
                    <span className={`status-dot-indicator ${data.connection.status}`} />
                    <strong>{statuses[data.connection.status]}</strong>
                    {data.connection.status==='connected'&&data.connection.expiresAt&&(
                      <span className="muted expiry-note">· Disponible hasta {date(data.connection.expiresAt)}</span>
                    )}
                  </div>
                </div>

                <div className="connection-actions-group">
                  <button
                    type="button"
                    className="save-settings-btn provider-connect-btn"
                    onClick={()=>void action('authorization')}
                    disabled={busy||running||data.connection.status==='pending'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    <span>{data.connection.status==='connected'?'Volver a conectar ChatGPT':'Conectar con ChatGPT'}</span>
                  </button>
                  {['pending','connected'].includes(data.connection.status)&&(
                    <button
                      type="button"
                      className="provider-disconnect-btn"
                      onClick={()=>void action('disconnect')}
                      disabled={busy}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                        <line x1="12" y1="2" x2="12" y2="12"/>
                      </svg>
                      <span>Desconectar ChatGPT</span>
                    </button>
                  )}
                </div>
              </div>

              {data.connection.errorCode&&<p className="form-error">{explain(data.connection.errorCode)}</p>}

              <p className="muted note-text">
                {data.connection.renewable
                  ? 'Renovación automática activa. Las credenciales se conservan cifradas y sobreviven al cierre de sesión del panel y al reinicio del servicio.'
                  : 'La conexión actual no tiene acceso renovable guardado. Conecta ChatGPT para habilitar la renovación automática.'} Desconectar ChatGPT elimina el acceso guardado e intenta revocarlo en el proveedor.
              </p>

              {data.connection.lastRefreshedAt&&<p className="muted small-note">Última renovación: {date(data.connection.lastRefreshedAt)}.</p>}
              {data.connection.retryAt&&<p className="muted small-note">Próximo intento de renovación: {date(data.connection.retryAt)}. Un fallo temporal conserva el acceso guardado.</p>}

              {authorization&&data.connection.status==='pending'&&(
                <div className="provider-authorization">
                  <p>Completa la autorización antes de {date(authorization.expiresAt)}. El estado se actualizará aquí al terminar.</p>
                  <a href={authorization.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="save-settings-btn" style={{display: 'inline-flex', alignItems: 'center', textDecoration: 'none'}}>
                    Continue with ChatGPT
                  </a>
                </div>
              )}

              {data.connection.status==='connected'&&(
                <div className="provider-evaluation-form settings-section-card" style={{marginTop: '20px'}}>
                  <h4 className="settings-card-title">Ejecutar prueba de evaluación con casos sintéticos</h4>
                  <div className="form-field">
                    <label htmlFor="provider-model">Modelo de tu cuenta</label>
                    <select
                      id="provider-model"
                      value={model}
                      onChange={event=>{setModel(event.target.value);setEffort('');setConsent(false);}}
                      disabled={busy||running}
                    >
                      {data.connection.models.map(value=><option key={value.slug} value={value.slug}>{value.displayName}</option>)}
                    </select>
                  </div>
                  <ReasoningSelect id="provider-effort" model={data.connection.models.find(value=>value.slug===model)} value={effort} onChange={value=>{setEffort(value);setConsent(false);}} disabled={busy||running}/>
                  <label className="checkbox-label provider-consent-label">
                    <input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy||running}/>
                    <span>Quiero enviar los seis casos sintéticos usando mi plan de ChatGPT.</span>
                  </label>
                  <button
                    className="save-settings-btn"
                    onClick={()=>void action('evaluations')}
                    disabled={busy||running||!consent||!model}
                  >
                    {running?'Evaluando casos…':'Evaluar proveedor'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="muted">Solo el gestor puede conectar ChatGPT e iniciar pruebas. Puedes consultar las evaluaciones guardadas del proyecto.</p>
          )}

          <div className="evaluations-history-block" style={{marginTop: '28px'}}>
            <h3 className="section-subtitle">Evaluaciones recientes</h3>
            {!data.evaluations.length && (
              <p className="muted">Aún no hay evaluaciones de calidad guardadas. La prueba inicial de acceso no sustituye estas evaluaciones.</p>
            )}
            <div className="work-items">
              {data.evaluations.map(evaluation=>(
                <article key={evaluation.id} className="work-item">
                  <div className="section-heading">
                    <h4>{evaluationStatuses[evaluation.status]} · {evaluation.model}</h4>
                    <span className="badge">{date(evaluation.createdAt)}</span>
                  </div>
                  <p className="muted">Razonamiento: {evaluation.reasoningEffort?effortLabels[evaluation.reasoningEffort]:'Predeterminado'}</p>
                  {evaluation.status==='running'&&<p role="status">Ejecutando los casos en secuencia. No cierres sesión ni desconectes para completar la prueba.</p>}
                  {evaluation.errorCode&&<p className="form-error">{explain(evaluation.errorCode)}</p>}
                  {evaluation.result&&(
                    <>
                      <p><strong>{evaluation.result.passed} de {evaluation.result.total}</strong> casos superaron las comprobaciones automáticas. Revisión humana pendiente; este resultado no habilita cambios externos.</p>
                      <details><summary>Ver casos y respuestas</summary>{evaluation.result.cases.map(test=><div key={test.caseId} className="provider-case">
                        <h5>{test.title} · {test.passed?'Superado':'Revisar'}</h5><p>{(test.durationMs/1000).toLocaleString('es-EC')} s{test.usage?.total_tokens!==undefined&&` · ${test.usage.total_tokens} tokens`}</p>
                        <ul>{test.checks.map(check=><li key={check.code}>{checks[check.code]??check.code}: {check.passed?'Correcto':'No superado'}</li>)}</ul>
                        {test.output&&<><p>{classifications[test.output.classification]} · Evidencia: {test.output.evidenceIds.join(', ')}</p><p>{test.output.recommendation}</p>{test.output.unknowns.length>0&&<><p>Datos desconocidos:</p><ul>{test.output.unknowns.map((value,index)=><li key={index}>{value}</li>)}</ul></>}</>}
                        {test.errorCode&&<p>{explain(test.errorCode)}</p>}
                      </div>)}</details>
                    </>
                  )}
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
