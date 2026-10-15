import {AgentModelSelect} from './AgentModelSelect';
import {readAgentProviders,providerDestination} from './agentProviders';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {AgentVerdict,ProjectAccess,ProposalOverview,ProposalState,ProposalVersionView,ProviderOverview,ReasoningEffort,SupervisionOverview,TrelloOverview,TrackingPolicyResponse,TrelloAction} from '@dev-project-agent/contracts';
import {ExecutionPanel} from './ExecutionPanel';
import {ReasoningSelect,effortLabels} from './ReasoningSelect';

const states:Record<ProposalState,string>={draft:'Preparando propuesta',pending_review:'Revisión pendiente',in_review:'Revisando propuesta',pending_policy_check:'Control de aprobación pendiente',in_policy_check:'Comprobando política',pending_human_approval:'Esperando decisión del gestor',authorized:'Autorizada',changes_requested:'Ajustes solicitados',rejected:'Rechazada',invalidated:'Invalidada o autorización retirada',executing:'Ejecutando cambio',executed:'Cambio verificado',execution_failed:'Ejecución fallida',reconciliation_required:'Reconciliación pendiente'};
const stages={executor:'Ejecutor',reviewer:'Revisor',approver:'Aprobador'};
const verdicts={validated:'Validada',human_required:'Requiere decisión del gestor',changes_requested:'Solicita ajustes',rejected:'Rechaza'};
const checkLabels:Record<string,string>={evidence:'Evidencia',scope:'Alcance',preconditions:'Valores previos',risks:'Riesgos',verification:'Verificación',manager_only:'Autoridad del gestor',single_card:'Una sola tarjeta',no_execution:'Ausencia de ejecución'};
const failures:Record<string,string>={USAGE_LIMIT:'Se alcanzó un límite de ChatGPT; no se reintenta automáticamente.',SERVICE_RESTARTED:'El servicio se reinició. Puedes continuar la etapa pendiente.',FORBIDDEN:'El gestor perdió los permisos necesarios.',SOURCE_CHANGED:'Cambió la fuente o la lectura venció. Se necesita una versión nueva.',BLOCKING_QUESTIONS:'La respuesta dejó preguntas bloqueantes sin resolver.',CONNECTION_REQUIRED:'Conecta ChatGPT para continuar.',INVALID_AGENT_OUTPUT:'La respuesta no cumple el formato exigido.',INVALID_SCOPE:'La respuesta propuso acciones fuera del alcance.',INVALID_EVIDENCE:'La respuesta citó evidencia desconocida.',INVALID_AGENT_VERDICT:'El dictamen no respeta el flujo de autorización.',BLOCKING_CHECK:'Hay comprobaciones obligatorias sin superar.',HASH_MISMATCH:'El dictamen corresponde a otro contenido.'};
const date=(value:string|null)=>value?new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'Sin fecha';
async function read<T>(url:string,signal?:AbortSignal):Promise<T>{const response=await fetch(url,signal?{signal}:{});if(!response.ok)throw new Error('No se pudo consultar el flujo de propuestas.');return response.json() as Promise<T>;}
function verdict(value:unknown):AgentVerdict|null {return value&&typeof value==='object'&&'verdict' in value?value as AgentVerdict:null;}
function ActionSummary({action,members}:{action:TrelloAction;members:{id:string;displayName:string}[]}) {
  const names=(ids:string[])=>ids.map(id=>members.find(member=>member.id===id)?.displayName??id).join(', ')||'Sin asignar';
  if(action.type==='trello_members_change')return <div className="proposal-change"><p><strong>Asignados actuales:</strong> {names(action.expectedMembers)}</p><p><strong>Asignados propuestos:</strong> {names(action.proposedMembers)}</p></div>;
  if(action.type==='trello_priority_change'||action.type==='trello_state_change')return <div className="proposal-change"><p><strong>Etiquetas actuales:</strong> {action.expectedLabels.join(', ')} · Finalización: {action.expectedDueComplete?'declarada':'no declarada'}</p><p><strong>Etiquetas propuestas:</strong> {action.proposedLabels.join(', ')} · Finalización: {action.proposedDueComplete?'declarada':'no declarada'}</p></div>;
  if(!('expectedDue' in action))return null;
  return <div className="proposal-change"><p><strong>Valor actual esperado:</strong> {date(action.expectedDue)}{action.type==='trello_dates_change'&&<> · Inicio: {date(action.expectedStart)}</>}</p><p><strong>Valor propuesto:</strong> {date(action.proposedDue)}{action.type==='trello_dates_change'&&<> · Inicio: {date(action.proposedStart)}</>}</p></div>;
}

export function ProposalPanel({project,csrfToken,sourceRevision}:{project:ProjectAccess;csrfToken:string;sourceRevision:number}) {
  const prefix=`/api/v1/projects/${project.id}`;
  const [overview,setOverview]=useState<ProposalOverview|null>(null),[provider,setProvider]=useState<ProviderOverview|null>(null),[sources,setSources]=useState<{trello:TrelloOverview;supervision:SupervisionOverview}|null>(null);
  const [selection,setSelection]=useState<{id:string;version:number}|null>(null),[detail,setDetail]=useState<ProposalVersionView|null>(null);
  const [purpose,setPurpose]=useState<'demonstration'|'live'>('demonstration');
  const [family,setFamily]=useState('due'),[start,setStart]=useState(''),[label,setLabel]=useState(''),[memberIds,setMemberIds]=useState<string[]>([]),[policy,setPolicy]=useState<TrackingPolicyResponse|null>(null);
  const [model,setModel]=useState(''),[effort,setEffort]=useState<ReasoningEffort|''>(''),[cardId,setCardId]=useState(''),[goal,setGoal]=useState(''),[due,setDue]=useState('');
  const [adjustment,setAdjustment]=useState<{id:string;version:number}|null>(null),[resumeConsent,setResumeConsent]=useState(false);
  const [consent,setConsent]=useState(false),[confirm,setConfirm]=useState(false),[reason,setReason]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState('');
  const request=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{const controller=new AbortController();void read<TrackingPolicyResponse>(prefix+'/tracking-policy',controller.signal).then(setPolicy).catch(()=>{});return()=>controller.abort();},[prefix,sourceRevision]);
  useEffect(()=>{const key='proposal-suggestion:'+project.id,stored=sessionStorage.getItem(key);if(!stored)return;sessionStorage.removeItem(key);try{const value=JSON.parse(stored);if(typeof value.cardId==='string'&&typeof value.goal==='string'){setCardId(value.cardId);setGoal(value.goal.slice(0,4000));if(['due','dates','members','priority','state'].includes(value.family))setFamily(value.family);}}catch{/* Ignore invalid local drafts. */}},[project.id]);
  const load=useCallback(async(signal:AbortSignal)=>{
    const [next,connection,trello,supervision]=await Promise.all([read<ProposalOverview>(prefix+'/proposals',signal),readAgentProviders(prefix,signal),read<TrelloOverview>(prefix+'/trello',signal),read<SupervisionOverview>(prefix+'/supervision',signal)]);
    if(signal.aborted)return;setOverview(next);setProvider(connection);setSources({trello,supervision});setLoadError('');
    setModel(previous=>connection.connection.models.some(value=>value.slug===previous)?previous:connection.connection.models[0]?.slug??'');
    setSelection(previous=>previous??(next.proposals[0]?{id:next.proposals[0].id,version:next.proposals[0].version}:null));
    const cards=trello.latest?.data.items.filter(item=>!item.archived&&item.kind!=='reference')??[];setCardId(previous=>cards.some(item=>item.id===previous)?previous:cards[0]?.id??'');
  },[prefix]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setLoadError('No se pudo actualizar el panel. Consulta de nuevo.');});return()=>controller.abort();},[load,revision,sourceRevision]);
  const active=overview?.jobs.some(job=>job.status==='running')??false;
  useEffect(()=>{const controller=new AbortController();let loading=false;const timer=setInterval(()=>{if(loading)return;loading=true;void load(controller.signal).then(()=>setRevision(value=>value+1)).catch(()=>{if(!controller.signal.aborted)setLoadError('No se pudo actualizar el panel. Consulta de nuevo.');}).finally(()=>{loading=false;});},active?2500:15000);return()=>{clearInterval(timer);controller.abort();};},[load,active]);
  useEffect(()=>{setDetail(null);setConfirm(false);setReason('');setResumeConsent(false);setAdjustment(null);},[selection?.id,selection?.version]);
  useEffect(()=>{if(!selection)return;const controller=new AbortController();void read<ProposalVersionView>(`${prefix}/proposals/${selection.id}/versions/${selection.version}`,controller.signal).then(value=>{if(!controller.signal.aborted)setDetail(value);}).catch(()=>{if(!controller.signal.aborted)setLoadError('No se pudo leer la versión seleccionada.');});return()=>controller.abort();},[prefix,selection?.id,selection?.version,revision]);
  const selectedModel=provider?.connection.models.find(value=>value.slug===model);
  useEffect(()=>{if(effort&&!selectedModel?.reasoningEfforts?.includes(effort))setEffort('');},[effort,selectedModel]);
  const latest=overview?.proposals.find(proposal=>proposal.id===selection?.id);
  const isLatest=detail?.version===latest?.version;
  const canAdjust=Boolean(detail&&isLatest&&['changes_requested','invalidated'].includes(detail.state));
  const adjusting=Boolean(canAdjust&&adjustment?.id===detail?.proposalId&&adjustment?.version===detail?.version);
  const selectedCard=sources?.trello.latest?.data.items.find(item=>item.id===cardId);
  const isDate=family==='due'||family==='dates',effectiveStart=family==='dates'?start:selectedCard?.start;
  const dateProblem=isDate&&due?(new Date(due).getTime()<=Date.now()?'Selecciona una fecha futura.':effectiveStart&&new Date(due).getTime()<new Date(effectiveStart).getTime()?'La nueva fecha no puede ser anterior al inicio registrado.':''):'';
  const connected=provider?.connection.status==='connected';
  async function mutate(path:string,body:Record<string,unknown>|null,onSuccess?:(result:{proposalId?:string;version?:number;invalidated?:boolean})=>void) {
    if(busy)return;setBusy(true);setError('');setNotice('');const signature=JSON.stringify({path,body});
    if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
    try{
      const response=await fetch(prefix+path,{method:'POST',headers:{'x-csrf-token':csrfToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,requestKey:request.current.key})}:{})});
      const result=await response.json();if(!response.ok){setError(result.message??'No se pudo confirmar la operación.');return;}
      request.current=null;onSuccess?.(result);setRevision(value=>value+1);
    }catch{setError('No se pudo confirmar la solicitud. Actualiza el panel antes de intentar de nuevo.');}finally{setBusy(false);}
  }
  async function prepare() {
    if(!sources?.supervision.latestRun||!consent||isDate&&!due)return;
    if(dateProblem){setError(dateProblem);return;}
    const target=new Date(due);if(isDate&&!Number.isFinite(target.getTime())){setError('Selecciona una fecha válida.');return;}
    if(family==='dates'&&!Number.isFinite(new Date(start).getTime())){setError('Selecciona un inicio válido.');return;}
    const change=family==='due'?{requestedDue:target.toISOString()}:{requestedChange:family==='dates'?{family,start:new Date(start).toISOString(),due:target.toISOString()}:family==='members'?{family,memberIds}:{family,label}};
    await mutate('/proposals',{...(!adjusting?{purpose}:{}),sourceRunId:sources.supervision.latestRun.id,cardId,...change,goal,model,...(effort?{reasoningEffort:effort}:{}),...(adjusting?{proposalId:detail!.proposalId,expectedVersion:detail!.version}:{})},result=>{if(result.proposalId&&result.version)setSelection({id:result.proposalId,version:result.version});setConsent(false);setNotice('Proceso iniciado. Cada agente trabajará en secuencia.');});
  }
  function decide(decision:'approved'|'rejected'|'changes_requested') {
    if(!detail||!detail.contentHash)return;
    void mutate(`/proposals/${detail.proposalId}/versions/${detail.version}/decisions`,{contentHash:detail.contentHash,decision,reason},result=>setNotice(result.invalidated?'La propuesta quedó invalidada. Actualiza las fuentes y prepara una nueva versión.':decision==='approved'?(detail.purpose==='demonstration'?'Aprobación de demostración registrada. Esta propuesta no puede modificar Trello.':'Autorización registrada. Todavía no se ejecutan cambios en Trello.'):'Decisión registrada.'));
  }
  const path=detail?`/proposals/${detail.proposalId}/versions/${detail.version}`:'';
  const cards=sources?.trello.latest?.data.items.filter(item=>!item.archived&&item.kind!=='reference')??[];
  return <section aria-labelledby="proposal-title" className="proposal-panel">
    <div className="section-heading"><h2 id="proposal-title">Agentes, propuestas y decisiones</h2><button disabled={busy} onClick={()=>{setError('');setRevision(value=>value+1);}}>Actualizar propuestas</button></div>
    <p className="muted">Ejecutor: prepara el cambio. Revisor: verifica la propuesta. Aprobador: comprueba la política y remite la decisión al gestor. Cada propuesta delimita una familia de cambios en una tarjeta. Las demostraciones no pueden ejecutarse; los cambios reales requieren una solicitud separada y escrituras habilitadas.</p>
    {(error||loadError)&&<p role="alert" className="form-error">{error||loadError}</p>}{notice&&<p role="status">{notice}</p>}
    {project.canManageProject&&<details className="proposal-form" open>
      <summary>{adjusting?'Preparar nueva versión con ajustes':'Preparar propuesta'}</summary>
      <div className="proposal-editor">
      {!connected&&<p>Conecta ChatGPT o inicia Ollama en Configuración para iniciar o continuar los agentes.</p>}
      {!sources?.supervision.latestRun&&<p>Primero actualiza las fuentes y ejecuta una supervisión.</p>}
      <div className="input-group"><label htmlFor="proposal-purpose">Propósito de la propuesta</label><select id="proposal-purpose" value={adjusting?detail!.purpose:purpose} disabled={busy||active||adjusting} onChange={event=>{setPurpose(event.target.value as typeof purpose);setConsent(false);}}><option value="demonstration">Demostración (sin cambios en Trello)</option><option value="live">Uso real (puede solicitar ejecución tras aprobación)</option></select><p className="muted">El propósito se conserva en todas las versiones y no se puede convertir una demostración en una propuesta real.</p></div>
      <div className="input-group"><label htmlFor="proposal-card">Tarjeta a revisar</label><select id="proposal-card" value={cardId} onChange={event=>{setCardId(event.target.value);setConsent(false);}} disabled={busy||active||adjusting}>{cards.map(card=><option key={card.id} value={card.id}>{card.name}</option>)}</select></div>
      <p>Inicio leído: {date(selectedCard?.start??null)} · Vencimiento leído: {date(selectedCard?.due??null)}</p>
      <div className="input-group"><label htmlFor="proposal-family">Tipo de ajuste</label><select id="proposal-family" value={family} disabled={busy||active} onChange={event=>{setFamily(event.target.value);setLabel('');setConsent(false);}}><option value="due">Vencimiento</option><option value="dates">Inicio y vencimiento</option><option value="priority">Prioridad</option><option value="members">Responsables asignados</option><option value="state">Estado declarado</option></select></div>
      <div className="input-group"><label htmlFor="proposal-goal">Objetivo y ajuste solicitado</label><textarea id="proposal-goal" maxLength={1000} value={goal} onChange={event=>{setGoal(event.target.value);setConsent(false);}} disabled={busy||active} placeholder="Explica la propuesta sin incluir credenciales ni datos personales."/></div>
      {family==='dates'&&<label>Nuevo inicio (hora de este dispositivo)<input type="datetime-local" value={start} disabled={busy||active} onChange={event=>{setStart(event.target.value);setConsent(false);}}/></label>}
      {isDate&&<div className="input-group"><label htmlFor="proposal-due">Nueva fecha objetivo (hora de este dispositivo)</label><input id="proposal-due" type="datetime-local" value={due} onChange={event=>{setDue(event.target.value);setConsent(false);}} disabled={busy||active}/>{due&&Number.isFinite(new Date(due).getTime())&&<p className="muted">En Ecuador: {date(new Date(due).toISOString())}. Es una propuesta de planificación, no una promesa de finalización.</p>}{dateProblem&&<p role="alert" className="form-error">{dateProblem}</p>}</div>}
      {(family==='priority'||family==='state')&&<label>Etiqueta propuesta<select value={label} disabled={busy||active} onChange={event=>{setLabel(event.target.value);setConsent(false);}}><option value="">Seleccionar etiqueta configurada…</option>{Object.keys((family==='priority'?policy?.priorityLabels:policy?.stateLabels)??{}).map(value=><option key={value}>{value}</option>)}</select><small>Se conservan las etiquetas ajenas a esta familia. Define los mapeos en Configuración.</small></label>}
      {family==='members'&&<fieldset><legend>Asignados propuestos</legend>{sources?.trello.latest?.data.members.map(member=><label className="confirmation" key={member.id}><input type="checkbox" checked={memberIds.includes(member.id)} disabled={busy||active} onChange={event=>{setMemberIds(ids=>event.target.checked?[...ids,member.id]:ids.filter(id=>id!==member.id));setConsent(false);}}/>{member.displayName}</label>)}<p className="muted">Selecciona al menos un integrante. La pertenencia al tablero no acredita disponibilidad.</p></fieldset>}
      <AgentModelSelect id="proposal-model" models={provider?.connection.models??[]} value={model} onChange={value=>{setModel(value);setEffort('');setConsent(false);}} disabled={busy||active}/>
      <ReasoningSelect id="proposal-effort" model={selectedModel} value={effort} onChange={value=>{setEffort(value);setConsent(false);}} disabled={busy||active}/>
      <label className="confirmation"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy||active}/>Quiero enviar a {providerDestination(model)} el objetivo, los identificadores, nombre, estado, fechas, WBS, etiquetas y asignados de esta tarjeta, junto con las propuestas y dictámenes. Se utilizará el proveedor seleccionado.</label>
      <button disabled={busy||active||!connected||!model||!consent||!goal.trim()||isDate&&!due||family==='dates'&&!start||family==='members'&&!memberIds.length||['priority','state'].includes(family)&&!label||Boolean(dateProblem)||!cardId||!sources?.supervision.latestRun} onClick={()=>void prepare()}>{active?'Agentes en ejecución…':adjusting?'Preparar nueva versión':'Iniciar los tres agentes'}</button>
      {adjusting&&<button disabled={busy||active} onClick={()=>{setAdjustment(null);setConsent(false);}}>Preparar otra propuesta</button>}
      </div>
    </details>}
    <h3>Propuestas guardadas</h3>{overview&&!overview.proposals.length&&<p>Aún no hay propuestas.</p>}
    <div className="work-items">{overview?.proposals.map(proposal=><article key={proposal.id} className="work-item"><h4>{proposal.cardName} · Versión {proposal.version}</h4><p>{states[proposal.state]} · {proposal.purpose==='demonstration'?'Demostración':'Uso real'}</p><p>{proposal.goal}</p><button onClick={()=>{setSelection({id:proposal.id,version:proposal.version});setConsent(false);}}>Abrir propuesta</button></article>)}</div>
    {detail&&<article className="proposal-detail">
      <h3>Detalle de propuesta · Versión {detail.version}</h3><ol className="proposal-journey" aria-label="Recorrido de la propuesta"><li>Cambio solicitado</li><li>Evidencia</li><li>Dictámenes</li><li>Decisión del gestor</li><li>Ejecución y resultado</li></ol><p className="muted">Estado actual: <strong>{states[detail.state]}</strong>. Revisa los apartados en este orden. La aprobación y la ejecución son pasos separados.</p>
      <label htmlFor="proposal-version">Versión conservada</label><select id="proposal-version" value={detail.version} onChange={event=>setSelection({id:detail.proposalId,version:Number(event.target.value)})}>{Array.from({length:latest?.version??detail.version},(_,index)=><option key={index+1} value={index+1}>Versión {index+1}</option>)}</select>
      <p role="status"><strong>{states[detail.state]}</strong></p><p>{detail.context.card.name} · {date(detail.createdAt)}</p>
      {detail.state==='authorized'&&<p>El gestor autorizó esta versión. Ninguna acción se ha ejecutado en Trello.</p>}
      {detail.content&&<><h4>{detail.content.objective}</h4><p>{detail.content.justification}</p>
        <ActionSummary action={detail.content.actions[0]!} members={sources?.trello.latest?.data.members??[]}/>
        <p><strong>Impacto:</strong> {detail.content.impact}</p><h4>Alternativas</h4><ul>{detail.content.alternatives.map((value,index)=><li key={index}>{value}</li>)}</ul><h4>Riesgos</h4><ul>{detail.content.risks.map((value,index)=><li key={index}>{value}</li>)}</ul>
        <p><strong>Verificación prevista:</strong> {detail.content.verificationPlan}</p><p><strong>Recuperación prevista:</strong> {detail.content.recoveryPlan}</p>
        {detail.content.unresolvedQuestions.length>0&&<><h4>Preguntas pendientes</h4><ul>{detail.content.unresolvedQuestions.map((value,index)=><li key={index}>{value}</li>)}</ul></>}
        <details><summary>Evidencia y contenido identificado</summary><p>Evidencia citada: {detail.content.evidenceIds.join(', ')}</p><p className="content-hash">Identificador del contenido: {detail.contentHash}</p><p>Tarjeta: {detail.context.card.id} · Supervisión: {detail.sourceRunId}</p><p>La comprobación utiliza la última lectura local. Antes de ejecutar se volverá a leer Trello y después se verificará el resultado.</p></details></>}
      <h4>Dictámenes e historial de etapas</h4>{detail.messages.map(message=>{const review=verdict(message.output);const job=overview?.jobs.find(value=>value.id===message.jobId);return <div key={message.id} className="provider-case"><h5>{stages[message.stage]} · {message.status==='succeeded'?'Completado':'No completado'}</h5><p>{date(message.createdAt)}{job&&` · ${job.model} · ${job.reasoningEffort?effortLabels[job.reasoningEffort]:'Predeterminado'}`}{message.durationMs!==null&&` · ${(message.durationMs/1000).toFixed(1)} s`}{message.usage?.total_tokens!==undefined&&` · ${message.usage.total_tokens} tokens`}</p>
        {message.errorCode&&<p className="form-error">{failures[message.errorCode]??'La etapa no terminó. Revisa la conexión y consulta el estado.'}</p>}{review&&<><p><strong>{verdicts[review.verdict]}</strong> · {review.summary}</p><ul>{review.checks.map(check=><li key={check.code}>{checkLabels[check.code]??check.code}: {check.status==='pass'?'Superado':check.status==='fail'?'No superado':'Sin comprobar'} · {check.reason}</li>)}</ul>{review.issues.length>0&&<ul>{review.issues.map((value,index)=><li key={index}>{value}</li>)}</ul>}</>}</div>;})}
      {project.canManageProject&&isLatest&&!active&&<>
        {!['rejected','changes_requested','invalidated','executing','executed','reconciliation_required'].includes(detail.state)&&<button disabled={busy} onClick={()=>void mutate(path+'/recheck',null)}>Comprobar vigencia de la propuesta</button>}
        {['draft','pending_review','pending_policy_check'].includes(detail.state)&&<><p>El proceso se detuvo; continuar vuelve a solicitar solo las etapas pendientes y utiliza el proveedor seleccionado.</p><label className="confirmation"><input type="checkbox" checked={resumeConsent} onChange={event=>setResumeConsent(event.target.checked)} disabled={busy}/>Quiero reenviar a {providerDestination(model)} el contexto conservado y el contenido de esta versión para continuar su revisión.</label><button disabled={busy||!connected||!model||!resumeConsent} onClick={()=>void mutate(path+'/resume',{model,...(effort?{reasoningEffort:effort}:{})},()=>{setResumeConsent(false);setNotice('Etapa pendiente iniciada.');})}>Continuar etapa pendiente</button></>}
        {canAdjust&&<button disabled={busy} onClick={()=>{setAdjustment({id:detail.proposalId,version:detail.version});setCardId(detail.context.card.id);setGoal(detail.goal);const action=detail.content?.actions[0],local=(value:string)=>{const time=new Date(value);time.setMinutes(time.getMinutes()-time.getTimezoneOffset());return time.toISOString().slice(0,16);};if(action?.type==='trello_dates_change'){setFamily('dates');setStart(local(action.proposedStart));setDue(local(action.proposedDue));}else if(action?.type==='trello_members_change'){setFamily('members');setMemberIds(action.proposedMembers);}else if(action?.type==='trello_priority_change'||action?.type==='trello_state_change'){setFamily(action.type==='trello_priority_change'?'priority':'state');setLabel('');}else{setFamily('due');if(detail.requestedDue)setDue(local(detail.requestedDue));}setConsent(false);document.getElementById('proposal-goal')?.focus();}}>Usar esta propuesta como base del ajuste</button>}
        {detail.state==='pending_human_approval'&&<div className="manager-decision"><h4>Decisión del gestor sobre la versión {detail.version}</h4>
          <label htmlFor="proposal-reason">Motivo de la decisión (obligatorio para rechazo o ajustes)</label><textarea id="proposal-reason" maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/>
          <label className="confirmation"><input type="checkbox" checked={confirm} onChange={event=>setConfirm(event.target.checked)} disabled={busy}/>{detail.purpose==='demonstration'?'He revisado esta versión y registro una aprobación de demostración, sin cambios en Trello.':'He revisado esta versión y autorizo el cambio propuesto. La ejecución se solicitará por separado.'}</label>
          <div className="supervision-actions"><button disabled={busy||!confirm} onClick={()=>decide('approved')}>Aprobar esta versión</button><button disabled={busy||!reason.trim()} onClick={()=>decide('changes_requested')}>Solicitar ajustes</button><button disabled={busy||!reason.trim()} onClick={()=>decide('rejected')}>Rechazar propuesta</button></div>
        </div>}
      </>}
      <ExecutionPanel key={`${detail.proposalId}:${detail.version}`} project={project} csrfToken={csrfToken} proposal={detail} isLatest={isLatest} onChanged={()=>{setNotice('');setRevision(value=>value+1);}}/>
      {detail.decisions.length>0&&<><h4>Decisión registrada</h4>{detail.decisions.map(decision=><p key={decision.id}>{decision.decision==='approved'?'Aprobada':decision.decision==='rejected'?'Rechazada':'Ajustes solicitados'} · {date(decision.createdAt)} · {decision.reason||'Sin observaciones adicionales.'}</p>)}</>}
    </article>}
  </section>;
}
