import {useCallback,useEffect,useRef,useState} from 'react';
import type {ProjectAccess,OllamaOverview} from '@dev-project-agent/contracts';

const evaluationStatuses:Record<string,string>={
  running:'En ejecución',
  passed:'Comprobaciones superadas',
  failed:'Requiere revisión',
  interrupted:'Interrumpida',
};

const checks:Record<string,string>={
  schema:'Formato',
  case_binding:'Caso correcto',
  classification:'Clasificación',
  evidence:'Evidencia',
  human_approval:'Aprobación humana',
  uncertainty:'Datos desconocidos',
};

const classifications:Record<string,string>={
  overdue:'Vencida',
  completed:'Completada declarada',
  on_schedule:'Vencimiento futuro',
  insufficient_data:'Datos insuficientes',
};

const errors:Record<string,string>={
  OLLAMA_UNAVAILABLE:'No se pudo conectar con Ollama en el puerto local. Comprueba que Ollama esté activo en tu equipo.',
  MODEL_NOT_AVAILABLE:'El modelo seleccionado no está instalado en Ollama. Descárgalo antes de evaluar.',
  INVALID_MODEL_OUTPUT:'La respuesta del modelo local no cumple con el formato estructurado JSON.',
  INFERENCE_TIMEOUT:'La inferencia excedió el tiempo máximo de espera.',
  CONFLICT:'Ya hay una evaluación activa o la solicitud cambió. Actualiza el panel.',
  SERVICE_RESTARTED:'El servicio se reinició. La evaluación no se repite automáticamente.',
};

const explain=(code:string)=>errors[code]??'No se pudo completar la prueba con el modelo local. Vuelve a intentar.';
const date=(value:string)=>new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'});
const formatSize=(bytes:number)=>(bytes/(1024*1024*1024)).toFixed(1)+' GB';

export function OllamaPanel({project,csrfToken}:{project:ProjectAccess;csrfToken:string}) {
  const [data,setData]=useState<OllamaOverview|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [model,setModel]=useState('');
  const [consent,setConsent]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const requestKey=useRef<{selection:string;key:string}|null>(null);

  const prefix=`/api/v1/projects/${project.id}/ollama`;

  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(prefix,signal?{signal}:{});
    if(!response.ok)throw new Error('Ollama state is unavailable.');
    const next=await response.json() as OllamaOverview;
    if(signal?.aborted)return;
    setLoadError('');
    setData(next);
    setModel(previous=>next.connection.models.some(v=>v.name===previous)?previous:next.connection.models[0]?.name??'');
  },[prefix]);

  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal).catch(()=>{
      if(!controller.signal.aborted)setLoadError('No se pudo consultar el estado de Ollama local.');
    });
    return()=>controller.abort();
  },[load,refresh]);

  const running=data?.evaluations.some(value=>value.status==='running')??false;
  const polling=running||data?.connection.status==='connected';

  useEffect(()=>{
    if(!polling)return;
    const controller=new AbortController();
    let loading=false;
    const timer=setInterval(()=>{
      if(loading)return;
      loading=true;
      void load(controller.signal).catch(()=>{
        if(!controller.signal.aborted)setLoadError('No se pudo actualizar el estado de Ollama.');
      }).finally(()=>{loading=false;});
    },running?3000:15000);
    return()=>{clearInterval(timer);controller.abort();};
  },[load,polling,running]);

  async function evaluate() {
    if(busy||!model||!consent)return;
    setBusy(true);
    setError('');
    const selection=model;
    if(requestKey.current?.selection!==selection){
      requestKey.current={selection,key:crypto.randomUUID()};
    }
    try {
      const response=await fetch(`${prefix}/evaluations`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-csrf-token':csrfToken,
        },
        body:JSON.stringify({
          model,
          requestKey:requestKey.current!.key,
        }),
      });
      const body=await response.json();
      if(!response.ok){
        setError(body.message??'No se pudo iniciar la evaluación.');
        return;
      }
      requestKey.current=null;
      setConsent(false);
      setRefresh(v=>v+1);
    } catch {
      setError('No se pudo conectar con el servidor para iniciar la evaluación.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ollama-title" className="provider-panel">
      <div className="section-heading">
        <h2 id="ollama-title">Ollama (Modelos locales)</h2>
        <button onClick={()=>{setError('');setRefresh(v=>v+1);}} disabled={busy}>
          Actualizar estado
        </button>
      </div>
      <p className="muted">
        Usa los modelos disponibles en el servidor Ollama configurado. También puedes elegirlos en Propuestas, Código y Automatización. La privacidad y los recursos dependen del servidor y del modelo instalado.
        Puedes evaluar la capacidad de respuesta y fidelidad del JSON con la suite de seis casos sintéticos.
      </p>

      {(error||loadError)&&<p role="alert" className="form-error">{error||loadError}</p>}

      {!data?<p role="status">Comprobando servicio local de Ollama…</p>:<>
        <div style={{marginBottom:'16px'}}>
          <p role="status">
            Estado del servicio:{' '}
            <strong>
              {data.connection.status==='connected'?'Conectado en '+data.connection.baseUrl:'No disponible'}
            </strong>
          </p>
          {data.connection.status==='unavailable'&&<p className="muted">
            Ollama no responde en <code>{data.connection.baseUrl}</code>. Comprueba que Ollama esté abierto en tu sistema o inicia el servicio con el comando <code>ollama serve</code>.
          </p>}
        </div>

        {data.connection.status==='connected'&&project.canManageProject&&<>
          {data.connection.models.length===0?<p className="muted">
            No se detectaron modelos descargados en Ollama. Puedes descargar uno en tu terminal con <code>ollama pull qwen2.5-coder:7b</code>.
          </p>:<div className="provider-evaluation-form">
            <label htmlFor="ollama-model-select">Modelo local instalado</label>
            <select
              id="ollama-model-select"
              value={model}
              onChange={e=>{setModel(e.target.value);setConsent(false);}}
              disabled={busy||running}
            >
              {data.connection.models.map(m=>(
                <option key={m.name} value={m.name}>
                  {m.name} ({formatSize(m.size)}{m.details?.parameterSize?` · ${m.details.parameterSize}`:''}{m.details?.quantizationLevel?` ${m.details.quantizationLevel}`:''})
                </option>
              ))}
            </select>

            <label className="confirmation">
              <input
                type="checkbox"
                checked={consent}
                onChange={e=>setConsent(e.target.checked)}
                disabled={busy||running}
              />
              Quiero evaluar los seis casos sintéticos usando el modelo local <strong>{model}</strong>.
            </label>

            <button onClick={()=>void evaluate()} disabled={busy||running||!consent||!model}>
              {running?'Evaluando modelo local…':'Evaluar modelo con casos sintéticos'}
            </button>
          </div>}
        </>}

        {!project.canManageProject&&<p className="muted">
          Solo el gestor puede iniciar evaluaciones con modelos locales. Puedes consultar las evaluaciones guardadas a continuación.
        </p>}

        <h3>Evaluaciones recientes con Ollama</h3>
        {!data.evaluations.length&&<p className="muted">
          Aún no hay evaluaciones realizadas con modelos de Ollama en este proyecto.
        </p>}

        <div className="work-items">
          {data.evaluations.map(evaluation=>(
            <article key={evaluation.id} className="work-item">
              <h4>{evaluationStatuses[evaluation.status]??evaluation.status} · {evaluation.model}</h4>
              <p>{date(evaluation.createdAt)} · Motor: Ollama local</p>

              {evaluation.status==='running'&&<p role="status">
                Ejecutando inferencia en el modelo local. El tiempo depende de la velocidad de tu GPU.
              </p>}

              {evaluation.errorCode&&<p className="form-error">{explain(evaluation.errorCode)}</p>}

              {evaluation.result&&<>
                <p>
                  <strong>{evaluation.result.passed} de {evaluation.result.total}</strong> casos superaron las comprobaciones automáticas de esquema y lógica.
                </p>
                <details>
                  <summary>Ver casos y respuestas del modelo local</summary>
                  {evaluation.result.cases.map(test=>(
                    <div key={test.caseId} className="provider-case">
                      <h5>{test.title} · {test.passed?'Superado':'Revisar'}</h5>
                      <p>
                        {(test.durationMs/1000).toLocaleString('es-EC')} s
                        {test.usage?.total_tokens!==undefined&&` · ${test.usage.total_tokens} tokens`}
                      </p>
                      <ul>
                        {test.checks.map(check=>(
                          <li key={check.code}>
                            {checks[check.code]??check.code}: {check.passed?'Correcto':'No superado'}
                          </li>
                        ))}
                      </ul>
                      {test.output&&<>
                        <p>{classifications[test.output.classification]??test.output.classification} · Evidencia: {test.output.evidenceIds.join(', ')}</p>
                        <p>{test.output.recommendation}</p>
                        {test.output.unknowns.length>0&&<>
                          <p>Datos desconocidos:</p>
                          <ul>
                            {test.output.unknowns.map((val,idx)=><li key={idx}>{val}</li>)}
                          </ul>
                        </>}
                      </>}
                      {test.errorCode&&<p className="form-error">{explain(test.errorCode)}</p>}
                    </div>
                  ))}
                </details>
              </>}
            </article>
          ))}
        </div>
      </>}
    </section>
  );
}
