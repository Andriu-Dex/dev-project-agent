import {RecoveryPanel} from './RecoveryPanel';
import {useEffect,useRef,useState} from 'react';
import type {ExecutionOverview,ExecutionJobView,ExecutionEventView,ProposalVersionView,ProjectAccess} from '@dev-project-agent/contracts';

const statusLabels={queued:'En cola',running:'En ejecución',succeeded:'Resultado verificado',blocked:'Bloqueada antes de escribir',failed:'Falló sin cambio confirmado',reconciliation_required:'Reconciliación pendiente'};
const stages={request:'Solicitud',preflight:'Comprobación previa',write:'Escritura',verification:'Verificación posterior',reconciliation:'Reconciliación',recovery:'Recuperación tras reinicio'};
const outcomes={requested:'Solicitada',started:'Iniciada',succeeded:'Superada',failed:'No superada',uncertain:'Resultado incierto'};
const codes:Record<string,string>={SOURCE_CHANGED:'Cambió la fuente o configuración: se requiere una nueva versión.',FORBIDDEN:'El gestor perdió sus permisos.',REMOTE_DISCREPANCY:'El valor observado no coincide con todo el cambio aprobado. No se repetirá la escritura.',REMOTE_READ_FAILED:'No se pudo leer el resultado. Consulta para reconciliarlo.',SERVICE_RESTARTED:'Se interrumpió el servicio. La escritura no se repite al reiniciar.',REMOTE_WRITE_REJECTED:'Trello rechazó la petición.',REMOTE_ACCESS_DENIED:'La cuenta no puede modificar este tablero.',RATE_LIMITED:'Trello limitó las peticiones. No se reintenta automáticamente.',WRITES_DISABLED:'Las escrituras están desactivadas.',CONFLICT:'Había otra operación activa.'};
const date=(value:string|null)=>value?new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'Sin fecha';
export function ExecutionPanel({project,csrfToken,proposal,isLatest,onChanged}:{project:ProjectAccess;csrfToken:string;proposal:ProposalVersionView;isLatest:boolean;onChanged:()=>void}) {
  const prefix=`/api/v1/projects/${project.id}`;
  const [overview,setOverview]=useState<ExecutionOverview|null>(null),[selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<{job:ExecutionJobView;events:ExecutionEventView[]}|null>(null);
  const [confirmed,setConfirmed]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const requestKey=useRef<string|null>(null),onChangedRef=useRef(onChanged);onChangedRef.current=onChanged;
  useEffect(()=>{setConfirmed(false);setReason('');setSelected(null);setDetail(null);requestKey.current=null;},[proposal.proposalId,proposal.version,proposal.contentHash]);
  useEffect(()=>{
    const controller=new AbortController();let loading=false;
    async function load(){if(loading)return;loading=true;try{const response=await fetch(prefix+'/executions',{signal:controller.signal});if(!response.ok)throw new Error();const value=await response.json() as ExecutionOverview;if(!controller.signal.aborted){setOverview(value);setSelected(old=>old??value.jobs.find(job=>job.proposalId===proposal.proposalId&&job.version===proposal.version)?.id??null);}}catch{if(!controller.signal.aborted)setError('No se pudo consultar el historial de ejecución.');}finally{loading=false;}}
    void load();const timer=setInterval(()=>void load(),3000);return()=>{controller.abort();clearInterval(timer);};
  },[prefix,proposal.proposalId,proposal.version,revision]);
  const jobs=overview?.jobs.filter(job=>job.proposalId===proposal.proposalId&&job.version===proposal.version)??[];
  const current=jobs.find(job=>job.id===selected);
  useEffect(()=>{if(current&&!['queued','running'].includes(current.status))onChangedRef.current();},[current?.id,current?.status,current?.finishedAt]);
  useEffect(()=>{if(!selected)return;const controller=new AbortController();void fetch(prefix+'/executions/'+selected,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(value=>{if(!controller.signal.aborted)setDetail(value);}).catch(()=>{if(!controller.signal.aborted)setError('No se pudo consultar el intento.');});return()=>controller.abort();},[prefix,selected,current?.status,current?.finishedAt,revision]);
  const pending=overview?.jobs.some(job=>['queued','running','reconciliation_required'].includes(job.status))??false;
  async function mutate(path:string,body?:Record<string,unknown>) {
    if(busy)return;setBusy(true);setError('');
    try{const response=await fetch(prefix+path,{method:'POST',headers:{'x-csrf-token':csrfToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok){setError(result.message??'No se pudo completar la solicitud. Consulta el historial.');return;}
      requestKey.current=null;setConfirmed(false);if(result.id)setSelected(result.id);setRevision(value=>value+1);onChanged();
    }catch{setError('No se pudo confirmar la solicitud. Consulta el historial antes de reintentar.');}finally{setBusy(false);}
  }
  const path=`/proposals/${proposal.proposalId}/versions/${proposal.version}`;
  return <div className="execution-panel">
    <h4>Ejecución en Trello</h4>{jobs.filter(job=>job.status==='succeeded').map(job=><RecoveryPanel key={job.id} project={project} csrfToken={csrfToken} originalId={job.id} target="trello" onChanged={onChanged}/>)}
    {proposal.purpose==='demonstration'?<p><strong>Demostración: esta propuesta nunca puede modificar Trello.</strong> Las nuevas versiones conservarán este propósito.</p>:<p>Propuesta de uso real. Aprobarla y solicitar su ejecución son acciones separadas.</p>}
    {overview&&!overview.writesEnabled&&<p>Las escrituras reales están desactivadas en este entorno.</p>}
    {overview?.writesEnabled&&!overview.credentialsConfigured&&<p>Falta configurar una credencial de escritura independiente.</p>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    {project.canManageProject&&isLatest&&['authorized','execution_failed'].includes(proposal.state)&&proposal.purpose==='live'&&<>
      <label className="confirmation"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={busy||pending||!overview?.writesEnabled||!overview.credentialsConfigured}/>Confirmo que quiero aplicar en Trello el cambio exacto de esta versión aprobada.</label>
      <button disabled={busy||pending||!confirmed||!overview?.writesEnabled||!overview.credentialsConfigured} onClick={()=>{requestKey.current??=crypto.randomUUID();void mutate(path+'/execute',{contentHash:proposal.contentHash,confirmed:true,requestKey:requestKey.current});}}>Solicitar ejecución real</button>
    </>}
    {project.canManageProject&&isLatest&&['authorized','execution_failed','executing'].includes(proposal.state)&&<>
      <label htmlFor="withdraw-reason">Motivo para retirar la autorización</label><textarea id="withdraw-reason" maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/>
      <button disabled={busy||!reason.trim()} onClick={()=>void mutate(path+'/withdraw',{reason})}>Retirar autorización</button>
    </>}
    {jobs.length>0&&<><h5>Intentos conservados</h5><ul>{jobs.map(job=><li key={job.id}>{date(job.createdAt)} · {statusLabels[job.status]} <button disabled={busy} onClick={()=>setSelected(job.id)}>Ver intento</button></li>)}</ul></>}
    {detail&&detail.job.id===selected&&<>
      <p role="status"><strong>{statusLabels[detail.job.status]}</strong></p>{detail.job.errorCode&&<p>{codes[detail.job.errorCode]??'Consulta las comprobaciones del intento antes de continuar.'}</p>}
      {detail.job.status==='reconciliation_required'&&<><p>Consultar para reconciliar solo vuelve a leer Trello. No repite el cambio ni hace una reversión automática. Si el valor anterior sigue visible, el resultado continúa pendiente.</p>{project.canManageProject&&<button disabled={busy} onClick={()=>void mutate('/executions/'+detail.job.id+'/reconcile')}>Consultar para reconciliar</button>}</>}
      <details><summary>Comprobaciones y evidencia de ejecución</summary>{detail.events.map(event=><div key={event.id}><p>{date(event.createdAt)} · {stages[event.stage]} · {outcomes[event.outcome]}</p>{event.errorCode&&<p>{codes[event.errorCode]??'No se pudo completar la comprobación.'}</p>}{event.evidence&&<p>Tarjeta: {event.evidence.cardId} · Vencimiento observado: {date(event.evidence.due)} · Leído: {date(event.evidence.observedAt)}</p>}</div>)}</details>
      {detail.job.status==='succeeded'&&<p>El valor aprobado se observó en Trello. Actualiza las fuentes y ejecuta otra supervisión para incorporarlo al seguimiento.</p>}
    </>}
  </div>;
}
