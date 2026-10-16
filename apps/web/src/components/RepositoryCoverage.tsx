import {useCallback,useEffect,useState} from 'react';
import type {CoverageFile,CoverageOverview,CoverageSettings,CoverageState,CodeAnalysisResult,ProjectAccess,ProviderConnection} from '@dev-project-agent/contracts';
import {Icon} from './Workspace';
import {AgentModelSelect} from './AgentModelSelect';
import {ReasoningSelect} from './ReasoningSelect';
import {readAgentProviders} from './agentProviders';

const labels:Record<CoverageState,string>={pending:'Pendiente',reviewing:'En revisión',reviewed:'Revisado',partial:'Revisión parcial',outdated:'Requiere nueva revisión',failed:'Fallido',excluded:'Excluido'};
const reasons:Record<string,string>={sensitive_path:'Ruta potencialmente sensible',sensitive_source:'Posibles credenciales en el contenido',generated_or_dependency:'Archivo generado o dependencia',binary_or_unsupported:'Binario o formato no admitido',link_or_submodule:'Enlace o submódulo',file_read_limit:'Supera el límite de lectura de 1 MB',unsupported_path:'Ruta no admitida',unsupported_encoding:'Codificación no admitida',fragment_context:'Lectura por fragmentos; falta validación conjunta',language_context:'Lenguaje sin comprobación sintáctica completa',dependency_context:'Contexto de dependencias incompleto',line_read_limit:'Una línea supera el límite del fragmento'};
type FilePage={files:CoverageFile[];total:number;page:number;pageSize:number};
type Result={id:string;head:string;blobSha:string;lineStart:number;lineEnd:number;partIndex:number;current:boolean;createdAt:string;result:CodeAnalysisResult;context:{dependencies:Record<string,string>;included:string[];complete:boolean};settings:CoverageSettings};
const date=(value:string|null)=>value?new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'—';

export function RepositoryCoverage({project,csrfToken,onInspect}:{project:ProjectAccess;csrfToken:string;onInspect:(path:string)=>void}) {
  const prefix=`/api/v1/projects/${project.id}/code-review/coverage`;
  const [data,setData]=useState<CoverageOverview|null>(null),[draft,setDraft]=useState<CoverageSettings|null>(null);
  const [files,setFiles]=useState<FilePage>({files:[],total:0,page:1,pageSize:50});
  const [filter,setFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [models,setModels]=useState<ProviderConnection['models']>([]),[selected,setSelected]=useState(''),[results,setResults]=useState<Result[]>([]);
  async function read<T>(url:string,signal?:AbortSignal):Promise<T>{const response=await fetch(url,signal?{signal}:{});const body=await response.json();if(!response.ok)throw new Error(body.message??'No se pudo consultar la cobertura.');return body as T;}
  const load=useCallback(async(signal?:AbortSignal)=>{
    const [overview,listing]=await Promise.all([read<CoverageOverview>(prefix,signal),read<FilePage>(`${prefix}/files?${new URLSearchParams({...(filter?{state:filter}:{}),search,page:String(page)})}`,signal)]);
    if(signal?.aborted)return;setData(overview);setFiles(listing);
  },[prefix,filter,search,page]);
  useEffect(()=>{const abort=new AbortController();const timer=setTimeout(()=>void load(abort.signal).catch(value=>{if(!abort.signal.aborted)setError(value instanceof Error?value.message:'No se pudo cargar la cobertura.');}),200);return()=>{clearTimeout(timer);abort.abort();};},[load]);
  useEffect(()=>{if(!data?.enabled&&!data?.active)return;const abort=new AbortController();let loading=false;const timer=setInterval(()=>{if(loading)return;loading=true;void load(abort.signal).catch(()=>{if(!abort.signal.aborted)setError('No se pudo actualizar el avance. Puedes consultar de nuevo.');}).finally(()=>{loading=false;});},5000);return()=>{clearInterval(timer);abort.abort();};},[data?.enabled,data?.active,load]);
  useEffect(()=>{if(!project.canManageProject)return;const abort=new AbortController();void readAgentProviders(`/api/v1/projects/${project.id}`,abort.signal).then(value=>{if(!abort.signal.aborted)setModels(value.connection.models);}).catch(()=>{});return()=>abort.abort();},[project.id,project.canManageProject]);
  async function action(path:string,body:object,message:string){
    if(!data||busy)return;setBusy(true);setError('');setNotice('');
    try{const response=await fetch(prefix+path,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({...body,expectedRevision:data.revision})});const result=await response.json();if(!response.ok)throw new Error(result.message??'No se pudo completar la operación.');setData(result as CoverageOverview);setDraft(null);setNotice(message);await load();}
    catch(value){setError(value instanceof Error?value.message:'No se pudo completar la operación.');}finally{setBusy(false);}
  }
  const counts=data?.counts,eligible=counts?Object.entries(counts).filter(([key])=>key!=='excluded').reduce((sum,[,value])=>sum+value,0):0;
  const percent=eligible&&counts?Math.floor(counts.reviewed/eligible*1000)/10:0;
  const edit=(key:keyof CoverageSettings,value:CoverageSettings[keyof CoverageSettings])=>setDraft(previous=>({...previous!,[key]:value}));
  return <section className="repository-coverage" aria-labelledby="coverage-title">
    <div className="coverage-heading">
      <div>
        <span className="coverage-eyebrow">ANÁLISIS PROGRESIVO</span>
        <h2 id="coverage-title">Cobertura del repositorio</h2>
        <p>Revisa por tandas, conserva el avance y distingue lo pendiente de lo excluido.</p>
      </div>
      <button
        type="button"
        className="proposals-refresh-btn"
        disabled={busy}
        onClick={() => {
          setError('');
          void load().catch(() => setError('No se pudo actualizar la cobertura.'));
        }}
      >
        <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        <span>Actualizar</span>
      </button>
    </div>
    {error && <p role="alert" className="proposals-error-banner">{error}</p>}
    {notice && <p role="status" className="proposals-success-banner">{notice}</p>}
    {!data ? (
      <div className="proposals-empty-state">
        <span className="spin-icon">
          <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </span>
        <p>Consultando cobertura del repositorio…</p>
      </div>
    ) : (
      <>
        <div className="coverage-metrics">
          <div><strong>{percent}%</strong><span>Revisión completa</span><small>{counts!.reviewed} de {eligible} archivos elegibles</small></div>
          <div><strong>{counts!.pending + counts!.outdated}</strong><span>Pendientes o modificados</span><small>{counts!.outdated} requieren nueva revisión</small></div>
          <div><strong>{counts!.partial}</strong><span>Revisiones parciales</span><small>Fragmentos o contexto limitado</small></div>
          <div><strong>{counts!.excluded}</strong><span>Archivos excluidos</span><small>Con motivo visible y sin reenvío automático</small></div>
        </div>
        <div className="coverage-status">
          <span className="coverage-status-dot" data-active={data.enabled} />
          <strong>{data.active ? 'Tanda activa' : data.enabled ? 'Programación activa' : 'En pausa'}</strong>
          <span>Commit: <code>{data.head?.slice(0, 12) ?? 'Sin inventario'}</code></span>
          <span>Inventario: {date(data.observedAt)}</span>
          {data.enabled && <span>Próxima tanda: {date(data.nextRun)}</span>}
        </div>
        {data.lastError && (
          <p role="alert" className="proposals-error-banner">Última incidencia: {data.lastError}. Revisa los archivos fallidos y la conexión antes de continuar.</p>
        )}
        {counts!.failed > 0 && (
          <p role="status" className="proposals-error-banner">{counts!.failed} archivos con fallo. Filtra por Fallido para consultar el motivo y los intentos.</p>
        )}
        <p className="coverage-help">«Revisado» acredita las comprobaciones indicadas para ese contenido; no garantiza ausencia de defectos. La cobertura parcial no aumenta el porcentaje de revisión completa. No se ejecutan comandos ni se recorren pantallas.</p>
        {project.canManageProject && (
          <div className="coverage-actions">
            <button
              type="button"
              className="proposals-new-btn"
              disabled={busy || data.active || data.enabled}
              onClick={() => void action('/inventory', {}, 'Inventario actualizado; se conservó el historial y se detectaron cambios.')}
            >
              <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              <span>{data.head ? 'Actualizar inventario' : 'Preparar inventario'}</span>
            </button>
            <button
              type="button"
              disabled={busy || !data.head || data.enabled || data.active || Boolean(draft)}
              onClick={() => void action('/control', { action: 'start' }, 'Revisión activada. El servicio continuará por tandas mientras permanezca encendido.')}
            >
              <Icon path="M5 3l14 9-14 9V3z" />
              <span>Iniciar / continuar</span>
            </button>
            <button
              type="button"
              disabled={busy || !data.enabled}
              onClick={() => void action('/control', { action: 'pause' }, 'Revisión pausada. El fragmento en curso puede terminar y conservar su resultado.')}
            >
              <Icon path="M6 4h4v16H6zm8 0h4v16h-4z" />
              <span>Pausar</span>
            </button>
            <button
              type="button"
              disabled={busy || !data.head || data.enabled || data.active || !counts!.failed}
              onClick={() => void action('/control', { action: 'retry' }, 'Reintentos restablecidos; pulsa Iniciar / continuar cuando corresponda.')}
            >
              <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              <span>Habilitar reintentos</span>
            </button>
            <button
              type="button"
              disabled={busy || !data.head || data.enabled || data.active}
              onClick={() => setDraft(draft ? null : { ...data.settings })}
            >
              <Icon path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              <span>{draft ? 'Cerrar configuración' : 'Configurar tandas'}</span>
            </button>
          </div>
        )}
      {draft&&<form className="coverage-settings" onSubmit={event=>{event.preventDefault();void action('/settings',{settings:draft},'Configuración guardada. Si cambió el método de análisis, se solicitó una nueva revisión.');}}>
        <h3>Límites y programación</h3><div className="coverage-settings-grid">
          {([['batchUnits','Fragmentos por tanda',1,20],['partBytes','Bytes por fragmento',1000,24000],['contextBytes','Bytes de contexto adicional',0,16000],['maxSeconds','Tiempo objetivo por tanda (segundos)',10,600],['intervalMinutes','Intervalo entre tandas (minutos)',1,10080],['maxAttempts','Intentos automáticos por archivo',1,5]] as const).map(([key,label,min,max])=><label key={key}>{label}<input type="number" required min={min} max={max} value={draft[key]} onChange={event=>edit(key,event.target.valueAsNumber)}/></label>)}
        </div><p className="muted">El tiempo se comprueba entre fragmentos; una llamada en curso puede superarlo. Los límites de tamaño controlan la entrada, no garantizan un coste exacto en tokens.</p>
        <label className="coverage-check"><input type="checkbox" checked={draft.withAi} onChange={event=>edit('withAi',event.target.checked)}/>Complementar las reglas locales con IA</label>
        {draft.withAi&&<><AgentModelSelect id={'coverage-model-'+project.id} models={models} value={draft.model??''} onChange={value=>setDraft(previous=>({...previous!,model:value||null,reasoningEffort:null,consent:false}))}/><ReasoningSelect id={'coverage-effort-'+project.id} model={models.find(value=>value.slug===draft.model)} value={draft.reasoningEffort??''} onChange={value=>edit('reasoningEffort',value||null)}/><label className="coverage-check"><input required type="checkbox" checked={draft.consent} onChange={event=>edit('consent',event.target.checked)}/>Autorizo enviar el código elegible y su contexto al proveedor seleccionado en las tandas programadas.</label><p className="muted">La calidad depende del modelo. No se cambia de proveedor automáticamente. Para Ollama, fragmento y contexto suman como máximo 12 000 bytes.</p></>}
        <div className="coverage-actions"><button type="submit" className="proposals-new-btn" disabled={busy}>Guardar configuración</button><button type="button" onClick={()=>setDraft(null)}>Cancelar</button></div>
      </form>}
      {data.modules.length>0&&<details className="coverage-history"><summary>Avance por módulo · {data.modules.length}</summary><div className="coverage-module-grid">{data.modules.map(module=><button type="button" key={module.path} onClick={()=>{setSearch(module.path==='(raíz)'?'':module.path);setPage(1);}}><strong>{module.path}</strong><span>{module.reviewed}/{module.eligible} revisados · {module.partial} parciales · {module.excluded} excluidos</span></button>)}</div></details>}
      <div className="coverage-filter"><div><label htmlFor="coverage-search">Buscar archivo o módulo</label><input id="coverage-search" type="search" value={search} placeholder="Ej.: frontend/src/" onChange={event=>{setSearch(event.target.value);setPage(1);}}/></div><div><label htmlFor="coverage-state">Estado</label><select id="coverage-state" value={filter} onChange={event=>{setFilter(event.target.value);setPage(1);}}><option value="">Todos los estados</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div></div>
      <div className="coverage-table-wrap"><table className="coverage-table"><caption>{files.total} archivos encontrados · página {page}</caption><thead><tr><th scope="col">Archivo</th><th scope="col">Estado</th><th scope="col">Avance y alcance</th><th scope="col">Evidencia</th></tr></thead><tbody>{files.files.map(file=><tr key={file.path}><td><code>{file.path}</code><small>{file.size===null?'Tamaño desconocido':`${file.size.toLocaleString('es-EC')} bytes`}</small></td><td><span className={'coverage-badge coverage-'+file.state}>{labels[file.state]}</span></td><td><span>{file.state==='excluded'?'No aplica':`${file.completedParts}/${file.totalParts??'?'} fragmentos`}</span><small>{file.reason?(reasons[file.reason]??file.reason):'Análisis pendiente o completo según su estado.'}</small>{file.analysisHead&&<small>Último análisis: {file.analysisHead.slice(0,12)}</small>}</td><td><button type="button" disabled={busy} onClick={()=>{setSelected(file.path);setResults([]);void read<Result[]>(`${prefix}/results?${new URLSearchParams({path:file.path})}`).then(setResults).catch(()=>setError('No se pudo consultar la evidencia del archivo.'));}}>Ver historial</button></td></tr>)}</tbody></table>{!files.files.length&&<p className="coverage-empty">{data.head?'No hay archivos con esos filtros.':'Prepara el inventario para conocer el alcance del repositorio.'}</p>}</div>
      <div className="coverage-pagination"><span>Resultados paginados desde el servidor</span><button type="button" disabled={page===1} onClick={()=>setPage(value=>value-1)}>Anterior</button><button type="button" disabled={page*files.pageSize>=files.total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></div>
      {selected&&<section className="coverage-evidence" aria-label="Historial del archivo"><div className="coverage-heading"><h3>{selected}</h3><button type="button" onClick={()=>setSelected('')}>Cerrar historial</button></div>{project.canManageProject&&<button type="button" onClick={()=>onInspect(selected)}>Preparar análisis acotado para una corrección</button>}<p className="muted">Los fragmentos de cobertura no autorizan parches. Las correcciones usan el flujo acotado y su propia revisión y aprobación.</p><p className="muted">Hasta 100 fragmentos recientes. Los resultados anteriores se conservan en la base de datos.</p>{!results.length&&<p>No hay resultados guardados para este archivo.</p>}{results.map(result=><details key={result.id}><summary>{result.current?'Contenido vigente':'Histórico'} · líneas {result.lineStart}–{result.lineEnd} · {result.head.slice(0,12)} · {date(result.createdAt)}</summary><p>{result.result.summary}</p><p className="muted">{result.settings.withAi?result.settings.model:'Reglas locales'} · Blob {result.blobSha.slice(0,12)} · {result.context.included.length} archivos de contexto</p>{result.result.findings.map(finding=><article key={finding.id}><h4>{finding.title} · L{finding.startLine}–{finding.endLine}</h4><p>{finding.explanation}</p><pre>{finding.evidence}</pre><p>{finding.recommendation}</p></article>)}<details><summary>Comprobaciones y limitaciones</summary><ul>{result.result.checks.map((check,index)=><li key={index}>{check.path}: {check.status} · {check.message}</li>)}</ul><ul>{result.result.limitations.map((limit,index)=><li key={index}>{limit}</li>)}</ul></details></details>)}</section>}
      <details className="coverage-history"><summary>Historial de tandas · últimas {data.batches.length}</summary>{data.batches.map(batch=><div key={batch.id}><strong>{batch.status==='completed'?'Tanda finalizada':batch.status==='failed'?'Tanda con fallo':batch.status==='interrupted'?'Interrumpida':'En curso'}</strong><span>{date(batch.createdAt)} · {batch.reviewedUnits} fragmentos · {batch.head.slice(0,12)}{batch.errorCode?` · ${batch.errorCode}`:''}</span></div>)}</details>
    </>)}
  </section>;
}
