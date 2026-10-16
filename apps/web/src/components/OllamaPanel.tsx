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
  recommendation_spanish:'Recomendación en español',
  safety_no_execution_claim:'Sin reclamos de ejecución',
  injection_resistance:'Resistencia a inyecciones',
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
  const [suite,setSuite]=useState<'tracking-synthetic-v2'|'tracking-synthetic-v1'>('tracking-synthetic-v2');
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
  const selectedEvaluation=data?.evaluations.find(value=>value.model===model);
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
    const selection=`${model}:${suite}`;
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
          suiteVersion:suite,
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
        <h2 id="ollama-title">Ollama · proveedor opcional</h2>
        <button onClick={()=>{setError('');setRefresh(v=>v+1);}} disabled={busy}>
          Actualizar estado
        </button>
      </div>
      <p className="muted">
        Usa los modelos disponibles en el servidor Ollama configurado. También puedes elegirlos en Propuestas, Código y Automatización. La privacidad y los recursos dependen del servidor y del modelo instalado.
        Puedes evaluar la capacidad de respuesta y fidelidad del JSON con la suite base de seis casos o la suite ampliada de 24 casos sintéticos.
        La calidad, precisión y velocidad dependen del modelo seleccionado y del equipo. Conectar un modelo no garantiza que sea adecuado para las tareas del agente; revisa su evaluación antes de utilizarlo.
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
            No se detectaron modelos disponibles. Instala el modelo compatible que prefieras en tu servidor de Ollama y actualiza el estado.
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

            <p className="muted" role="status">{selectedEvaluation?`Última evaluación de este modelo: ${evaluationStatuses[selectedEvaluation.status]??selectedEvaluation.status}${selectedEvaluation.result?` · ${selectedEvaluation.result.passed}/${selectedEvaluation.result.total} casos`:''}. Los resultados requieren revisión humana y no garantizan la calidad en otros casos.`:'Modelo conectado sin evaluación guardada en este proyecto. Puedes evaluarlo antes de usarlo con los agentes.'}</p>
            <label htmlFor="ollama-suite-select">Suite de evaluación</label>
            <select
              id="ollama-suite-select"
              value={suite}
              onChange={e=>{setSuite(e.target.value as any);setConsent(false);}}
              disabled={busy||running}
            >
              <option value="tracking-synthetic-v2">Suite ampliada v2 (24 casos con JSON Schema)</option>
              <option value="tracking-synthetic-v1">Suite base v1 (6 casos sintéticos)</option>
            </select>

            <label className="confirmation">
              <input
                type="checkbox"
                checked={consent}
                onChange={e=>setConsent(e.target.checked)}
                disabled={busy||running}
              />
              Quiero evaluar el modelo local <strong>{model}</strong> usando la {suite==='tracking-synthetic-v2'?'suite ampliada v2 (24 casos con JSON Schema)':'suite base v1 (6 casos sintéticos)'}.
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
