import { useCallback, useEffect, useRef, useState } from 'react';
import type { BaselineVersion, GitHubOverview, ProjectAccess, SupervisionOverview, SupervisionRun, SupervisionJobKind } from '@dev-project-agent/contracts';

interface BaselineOverview { baseline:BaselineVersion|null;candidate:{snapshotId:string;source:'api'|'export';observedAt:string;activities:number;milestones:number}|null }
const date=(value:string)=>new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'});
const statusNames={queued:'En espera',running:'En ejecución',succeeded:'Completado',partial:'Completado parcialmente',failed:'Falló',complete:'Completo'};
const kindNames={trello_sync:'Actualizar Trello',github_sync:'Actualizar GitHub',analysis:'Analizar datos guardados',full:'Actualizar fuentes y analizar'};
const stages:Record<string,string>={trello:'Trello',github:'GitHub',analysis:'Análisis',supervision:'Supervisión',recovery:'Recuperación'};
const outcomes:Record<string,string>={started:'Iniciado',succeeded:'Completado',failed:'Falló',recovered:'Recuperado tras interrupción'};
const fields:Record<string,string>={name:'Nombre',kind:'Tipo',state:'Estado',labelNames:'Etiquetas (prioridad, estado e impedimentos)',start:'Inicio',due:'Vencimiento',memberIds:'Asignados',wbs:'WBS',principal:'Responsable principal',dependencies:'Dependencias',added:'Incorporado',not_observed:'Ya no forma parte del alcance activo'};
const errors:Record<string,string>={RATE_LIMITED:'El proveedor alcanzó su límite de consultas.',ACCESS_DENIED:'El proveedor rechazó el acceso.',CREDENTIALS_REQUIRED:'Faltan credenciales de Trello.',BRANCH_NOT_FOUND:'No se encontró la rama configurada.',NOT_FOUND:'El recurso externo no está disponible.',SOURCE_UNAVAILABLE:'La fuente no respondió.',FORBIDDEN:'Los permisos del gestor cambiaron.',NO_DATA:'No hay fuentes válidas.',LEASE_LOST:'El trabajo perdió su control de ejecución.',RECOVERY_EXHAUSTED:'Se agotaron los intentos de recuperación.',COMPARISON_TOO_LARGE:'La comparación excede el límite verificable de GitHub.'};
const explain=(code:string|null)=>code?errors[code]??'No se pudo completar esta etapa. Consulta la configuración y vuelve a intentar.':'';
function value(data:unknown):string { if(data===null||data===undefined)return 'Sin informar';if(typeof data==='string')return ({pending:'Pendiente',in_progress:'En curso',completed:'Completada declarada',activity:'Actividad',milestone:'Hito'} as Record<string,string>)[data]??data;return JSON.stringify(data); }

function ResultView({run}:{run:SupervisionRun}) {
  const result=run.result;
  return <article className="supervision-result">
    <h3>Resultado de supervisión</h3>
    <p>Guardado: {date(run.createdAt)} · {statusNames[run.status]} · Línea base: {result.baselineVersion??'Sin confirmar'}.</p>
    {result.tracking?.summary&&<p>Avance declarado: {result.tracking.summary.progress.percent?.toLocaleString('es-EC')??'No disponible'} % · {result.tracking.summary.activities.overdue} actividades vencidas · {result.tracking.summary.activities.dueSoon} próximas a vencer.</p>}
    {result.tracking?.source&&<p className="muted">Trello observado: {date(result.tracking.source.observedAt)}. {result.tracking.source.freshness==='recent'?'Lectura reciente para este corte.':'La fuente es histórica, antigua o no permite una evaluación temporal fiable.'}</p>}
    <h4>Dependencias: {result.dependencies.length} observaciones</h4>
    {!result.dependencies.length&&<p>No se detectaron observaciones en las relaciones declaradas para este corte.</p>}
    <div className="work-items">{result.dependencies.map((finding,index)=><article className="work-item" key={index}>
      <strong>{finding.itemName}</strong><p>{finding.message}</p>
      {finding.predecessorWbs&&<p>Predecesora WBS: {finding.predecessorWbs}</p>}
      {!!finding.evidence.length&&<details><summary>Ver evidencia</summary><ul>{finding.evidence.map((entry,index)=><li key={index}>{entry}</li>)}</ul></details>}
    </article>)}</div>
    <h4>Cambios frente a la línea base: {result.deviations.length}</h4>
    {result.baselineVersion===null?<p>Confirma una línea base para comparar la planificación.</p>:!result.deviations.length&&<p>Sin diferencias en los campos comparados.</p>}
    <div className="work-items">{result.deviations.map((deviation,index)=><article className="work-item" key={index}>
      <strong>{deviation.itemName}</strong><p>{fields[deviation.field]??deviation.field}{deviation.hoursShift!==null&&` · Desplazamiento de ${deviation.hoursShift.toLocaleString('es-EC')} horas`}</p>
      <details><summary>Ver comparación</summary><p>Antes: {value(deviation.before)}</p><p>En este corte: {value(deviation.after)}</p></details>
    </article>)}</div>
    {result.code&&<p>GitHub: rama {result.code.branch} · revisión <code>{result.code.head.slice(0,12)}</code> · {result.code.files.length} archivos en la comparación delimitada. Revisión de calidad del código: pendiente.</p>}
    <details><summary>Fuentes, reglas y límites</summary>
      <p>Lectura Trello: {result.trelloSnapshotId??'No disponible'}<br/>Lectura GitHub: {result.githubSnapshotId??'No disponible'}<br/>Análisis: {result.analysisVersion}<br/>Reglas: {result.tracking?.policy.version??'No disponible'}</p>
      <ul>{[...result.limitations,...(result.tracking?.limitations??[])].map((entry,index)=><li key={index}>{entry}</li>)}</ul>
    </details>
  </article>;
}

export function SupervisionPanel({project,csrfToken,onCompleted}:{project:ProjectAccess;csrfToken:string;onCompleted:()=>void}) {
  const [data,setData]=useState<SupervisionOverview|null>(null),[github,setGitHub]=useState<GitHubOverview|null>(null),[baseline,setBaseline]=useState<BaselineOverview|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmation,setConfirmation]=useState(false),[refresh,setRefresh]=useState(0);
  const [selectedRun,setSelectedRun]=useState<SupervisionRun|null>(null),[detailBusy,setDetailBusy]=useState(false);
  const [jobDetail,setJobDetail]=useState<{id:string;events:{stage:string;outcome:string;errorCode:string|null;createdAt:string}[]}|null>(null);
  const callbacks=useRef(onCompleted);callbacks.current=onCompleted;
  const previousActive=useRef(false);const retryRequest=useRef<{kind:SupervisionJobKind;key:string}|null>(null);
  const prefix=`/api/v1/projects/${project.id}`;
  const active=data?.jobs.some(job=>job.status==='queued'||job.status==='running')??false;
  const accept=useCallback((next:SupervisionOverview)=>{
    if(previousActive.current&&!next.jobs.some(job=>job.status==='queued'||job.status==='running')){setRefresh(number=>number+1);callbacks.current();}
    previousActive.current=next.jobs.some(job=>job.status==='queued'||job.status==='running');setData(next);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.all(['/supervision','/github','/baseline'].map(async suffix=>{
      const response=await fetch(prefix+suffix,{signal:controller.signal});if(!response.ok)throw new Error('Unable to load supervision.');return response.json();
    })).then(([supervision,github,baseline])=>{if(!controller.signal.aborted){accept(supervision);setGitHub(github);setBaseline(baseline);setError('');}})
      .catch(()=>{if(!controller.signal.aborted)setError('No se pudo actualizar la supervisión. Se conservan los datos mostrados.');});
    return()=>controller.abort();
  },[prefix,refresh,accept]);
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();let loading=false;
    const timer=setInterval(()=>{if(loading)return;loading=true;void fetch(prefix+'/supervision',{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('Unable to load job state.');return response.json();}).then(next=>{if(!controller.signal.aborted)accept(next);}).catch(()=>{if(!controller.signal.aborted)setError('No se pudo consultar el estado del trabajo. Puedes actualizar el panel.');}).finally(()=>{loading=false;});},2500);
    return()=>{clearInterval(timer);controller.abort();};
  },[prefix,active,accept]);
  async function enqueue(kind:SupervisionJobKind) {
    if(busy||active)return;setBusy(true);setError('');
    if(retryRequest.current?.kind!==kind)retryRequest.current={kind,key:crypto.randomUUID()};
    try{
      const response=await fetch(prefix+'/supervision/jobs',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({kind,requestKey:retryRequest.current.key})});
      const result=await response.json();if(!response.ok){setError(result.message??'No se pudo solicitar el trabajo.');return;}
      retryRequest.current=null;setSelectedRun(null);setRefresh(number=>number+1);
    }catch{setError('No se pudo confirmar la solicitud. Actualiza el panel o vuelve a intentar la misma acción.');}
    finally{setBusy(false);}
  }
  async function confirm() {
    if(!baseline?.candidate||!confirmation||busy||active)return;setBusy(true);setError('');
    try{
      const response=await fetch(prefix+'/baseline-versions',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({expectedVersion:baseline.baseline?.version??0,snapshotId:baseline.candidate.snapshotId})});
      const result=await response.json();if(!response.ok)setError(result.message??'No se pudo confirmar la línea base.');
      else{setConfirmation(false);setRefresh(number=>number+1);}
    }catch{setError('No se pudo confirmar el guardado. Actualiza la línea base antes de volver a intentar.');}
    finally{setBusy(false);}
  }
  async function openDetail(resource:'runs'|'jobs',id:string) {
    if(detailBusy)return;setDetailBusy(true);setError('');
    try{const response=await fetch(`${prefix}/supervision/${resource}/${id}`);const body=await response.json();if(!response.ok)throw new Error('Unable to read history.');
      if(resource==='runs')setSelectedRun(body);else setJobDetail({id,events:body.events});}
    catch{setError('No se pudo cargar el detalle.');}finally{setDetailBusy(false);}
  }
  const run=selectedRun??data?.latestRun;
  return <>
    <section aria-labelledby="supervision-title">
      <h2 id="supervision-title">Supervisión e historial</h2>
      <p>Actualiza las fuentes o analiza sus lecturas guardadas. Cada análisis conserva su corte y sus reglas.</p>
      {error&&<p role="alert" className="form-error">{error}</p>}
      {!data&&!error&&<p role="status">Cargando supervisión…</p>}
      <div className="supervision-actions">
        {project.canManageProject&&(Object.keys(kindNames) as SupervisionJobKind[]).map(kind=><button key={kind} disabled={busy||active} onClick={()=>void enqueue(kind)}>{kindNames[kind]}</button>)}
        <button disabled={busy} onClick={()=>{setError('');setRefresh(number=>number+1);callbacks.current();}}>Actualizar panel</button>
      </div>
      {active&&<p role="status">Hay un trabajo pendiente o en ejecución. Su estado se actualiza automáticamente.</p>}
      {data&&<>
        {!data.jobs.length&&<p>Todavía no se han solicitado trabajos.</p>}
        <details><summary>Trabajos recientes ({data.jobs.length})</summary><ul className="history-list">{data.jobs.map(job=><li key={job.id}>
          <strong>{kindNames[job.kind]}</strong> · {statusNames[job.status]} · {date(job.createdAt)} · Intento {job.attempt}
          {job.errorCode&&<p className="form-error">{explain(job.errorCode)}</p>}
          <button disabled={detailBusy} onClick={()=>void openDetail('jobs',job.id)}>Ver etapas</button>
        </li>)}</ul></details>
        {jobDetail&&<article><h3>Etapas del trabajo seleccionado</h3><ul>{jobDetail.events.map((event,index)=><li key={index}>{stages[event.stage]??'Etapa'} · {outcomes[event.outcome]??'Estado'} · {date(event.createdAt)} {event.errorCode&&`· ${explain(event.errorCode)}`}</li>)}</ul></article>}
        {!!data.runs.length&&<details><summary>Análisis recientes ({data.runs.length})</summary><ul className="history-list">{data.runs.map(entry=><li key={entry.id}>{date(entry.createdAt)} · {statusNames[entry.status]} <button disabled={detailBusy} onClick={()=>void openDetail('runs',entry.id)}>Abrir análisis</button></li>)}</ul></details>}
        {selectedRun&&<button onClick={()=>setSelectedRun(null)}>Mostrar último análisis</button>}
        {run?<ResultView run={run}/>:<p>Sin análisis guardados. El gestor puede solicitar uno cuando haya una lectura válida.</p>}
      </>}
    </section>
    <section aria-labelledby="baseline-title"><h2 id="baseline-title">Línea base de planificación</h2>
      {baseline?.baseline?<p>Versión {baseline.baseline.version} confirmada por {baseline.baseline.confirmedBy.displayName} el {date(baseline.baseline.confirmedAt)}.</p>:<p>{baseline?'No hay línea base confirmada en el agente.':error?'La información de línea base no está disponible.':'Cargando línea base…'}</p>}
      {baseline?.candidate&&<p>Lectura candidata: {date(baseline.candidate.observedAt)} · {baseline.candidate.source==='export'?'Exportación histórica':'Trello'} · {baseline.candidate.activities} actividades y {baseline.candidate.milestones} hitos.</p>}
      <p className="muted">La confirmación conserva las fechas, estados, responsables y dependencias de esta lectura como referencia. Las versiones anteriores se mantienen. Revisa la planificación de Trello antes de confirmar.</p>
      {project.canManageProject&&baseline?.candidate&&<>
        <label className="baseline-consent"><input type="checkbox" checked={confirmation} disabled={busy||active} onChange={event=>setConfirmation(event.target.checked)}/> He revisado esta lectura y quiero conservarla como línea base del agente.</label>
        <button disabled={busy||active||!confirmation||baseline.baseline?.snapshotId===baseline.candidate.snapshotId} onClick={()=>void confirm()}>Confirmar nueva versión de línea base</button>
      </>}
    </section>
    <section aria-labelledby="github-title"><h2 id="github-title">Código en GitHub</h2>
      {github?.connection?<p>{github.connection.owner}/{github.connection.repository} · rama {github.connection.branch}</p>:<p>{github?'Sin repositorio configurado.':error?'La información de GitHub no está disponible.':'Cargando información de GitHub…'}</p>}
      {github?.lastAttempt?.status==='failed'&&<p className="form-error">Falló la última lectura: {explain(github.lastAttempt.errorCode)} Se conserva la anterior.</p>}
      {github?.latest?<>
        <p>Observado: {date(github.latest.observedAt)} · revisión <code>{github.latest.data.head.slice(0,12)}</code>.</p>
        <details><summary>Ramas observadas ({github.latest.data.branches.length})</summary><ul>{github.latest.data.branches.map(branch=><li key={branch.name}>{branch.name} · <code>{branch.sha.slice(0,12)}</code></li>)}</ul></details>
        <details><summary>Commits recientes ({github.latest.data.commits.length})</summary><ul>{github.latest.data.commits.map(commit=><li key={commit.sha}><code>{commit.sha.slice(0,12)}</code> · {commit.message} · {commit.author??'Sin autor informado'}</li>)}</ul></details>
        <details><summary>Archivos de la comparación ({github.latest.data.files.length})</summary><ul>{github.latest.data.files.map(file=><li key={file.path}><code>{file.path}</code> · +{file.additions}/−{file.deletions}{file.hunks.length>0&&` · rangos desde líneas ${file.hunks.map(hunk=>hunk.startLine).join(', ')}`}</li>)}</ul></details>
        <details><summary>Alcance de la lectura</summary><p>Revisión base: {github.latest.data.base??'Primera lectura'}</p><ul>{github.latest.data.limitations.map(limit=><li key={limit}>{limit}</li>)}</ul></details>
      </>:<p>Sin lecturas de GitHub. El gestor puede solicitar la actualización.</p>}
    </section>
  </>;
}
