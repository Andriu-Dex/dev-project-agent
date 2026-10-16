import {AgentModelSelect} from './AgentModelSelect';
import {readAgentProviders,providerDestination} from './agentProviders';
import {useUnsavedChanges} from '../hooks/useUnsavedChanges';
import {useEffect,useState} from 'react';
import type {ProjectAccess,ProviderOverview,ReasoningEffort} from '@dev-project-agent/contracts';
import {ReasoningSelect} from './ReasoningSelect';
type Configuration={version:number;enabled:boolean;intervalMinutes:number;codeEnabled:boolean;codeHour:number;codeMinute?:number;codeDays?:number[];codeWithAi:boolean;model:string|null;reasoningEffort:string|null;consent:boolean;maxFiles:number};
type Overview={configuration:Configuration;cursor:null|{next_sync:string|null;next_code:string|null;last_error:string|null};runs:{id:string;kind:string;status:string;started_at:string;detail:unknown}[]};
export function OperationsSettings({project,csrfToken,mode="all"}:{project:ProjectAccess;csrfToken:string;mode?:"all"|"configuration"|"history"}) {
  const [data,setData]=useState<Overview|null>(null),[form,setForm]=useState<Configuration|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const dirty=!!form&&!!data&&JSON.stringify(form)!==JSON.stringify(data.configuration);
  useUnsavedChanges(dirty,'Automatización');
  const path=`/api/v1/projects/${project.id}/operations`;
  const [provider,setProvider]=useState<ProviderOverview|null>(null);
  useEffect(()=>{const controller=new AbortController();void readAgentProviders(`/api/v1/projects/${project.id}`,controller.signal).then(value=>{if(!controller.signal.aborted)setProvider(value);}).catch(()=>{});return()=>controller.abort();},[project.id,attempt]);
  useEffect(()=>{const controller=new AbortController();void fetch(path,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<Overview>;}).then(value=>{if(!controller.signal.aborted){setData(value);setForm(value.configuration);}}).catch(()=>{if(!controller.signal.aborted)setError('No se pudo consultar la programación.');});return()=>controller.abort();},[path,attempt]);
  async function save(){if(!form||busy)return;setBusy(true);setError('');setMessage('');try{const {version,...values}=form;const response=await fetch(path,{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({...values,expectedVersion:version})});const result=await response.json();if(!response.ok)throw new Error(result.message??'No se pudo guardar.');setData(result);setForm(result.configuration);setMessage('Programación guardada. Las lecturas no modifican Trello ni GitHub.');}catch(failure){setError(failure instanceof Error?failure.message:'No se pudo guardar.');}finally{setBusy(false);}}
  const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}):'Sin activar';
  return <section><div className="section-heading"><h2>Automatización del seguimiento</h2><button type="button" className="header-action-button" disabled={busy} onClick={()=>{setError('');setAttempt(value=>value+1);}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg><span>Actualizar programación</span></button></div><p className="muted">El servicio debe estar encendido. Horarios de Ecuador. Tras una pausa se actualizan las fuentes al estado disponible; no se reconstruyen lecturas históricas inexistentes.</p>{error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status">{message}</p>}{data&&<div className="source-status"><p>Próxima lectura: <strong>{date(data.cursor?.next_sync)}</strong></p><p>Próxima revisión de código: <strong>{date(data.cursor?.next_code)}</strong></p>{data.cursor?.last_error&&<p role="status">La operación necesita atención: {data.cursor.last_error}.</p>}</div>}
    {mode==="history"&&<p><a href="#settings">Cambiar horarios en Configuración → Automatización</a></p>}
    {mode!=="history"&&form&&project.canManageProject&&(
      <div className="settings-section-card operations-config-card">
        <h3 className="settings-card-title">Configurar lecturas y revisión de código</h3>
        <form onSubmit={event=>{event.preventDefault();void save();}} className="settings-grid">
          <label className="checkbox-label"><input type="checkbox" checked={form.enabled} disabled={busy} onChange={event=>setForm({...form,enabled:event.target.checked})}/>Activar lectura periódica de Trello y GitHub</label>
          <label>Intervalo de lectura (minutos)<input type="number" min={5} max={10080} required value={form.intervalMinutes} disabled={busy} onChange={event=>setForm({...form,intervalMinutes:Number(event.target.value)})}/></label>
          <label className="checkbox-label"><input type="checkbox" checked={form.codeEnabled} disabled={busy} onChange={event=>setForm({...form,codeEnabled:event.target.checked})}/>Activar revisión programada de código</label>
          <fieldset><legend>Días de revisión de código</legend><div className="weekday-options">{['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((day,index)=><label className="checkbox-label" key={day}><input type="checkbox" checked={(form.codeDays??[0,1,2,3,4,5,6]).includes(index)} disabled={busy} onChange={event=>setForm({...form,codeDays:event.target.checked?[...(form.codeDays??[]),index].sort((a,b)=>a-b):(form.codeDays??[]).filter(value=>value!==index)})}/>{day}</label>)}</div></fieldset>
          <label>Hora de revisión en Ecuador<input type="time" required value={String(form.codeHour).padStart(2,'0')+':'+String(form.codeMinute??0).padStart(2,'0')} disabled={busy} onChange={event=>{const [hour,minute]=event.target.value.split(':').map(Number);setForm({...form,codeHour:hour!,codeMinute:minute!});}}/></label>
          <p className="notification-preview">Revisión: {['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].filter((_,index)=>form.codeDays?.includes(index)).join(', ')||'elige al menos un día'} a las {String(form.codeHour).padStart(2,'0')}:{String(form.codeMinute??0).padStart(2,'0')}, hora de Ecuador.</p>
          <label>Límite de archivos por revisión diaria<input type="number" min={1} max={100} required value={form.maxFiles} disabled={busy} onChange={event=>setForm({...form,maxFiles:Number(event.target.value)})}/><small>Se revisan archivos nuevos o cuyo contenido cambió. Los pendientes y excluidos quedan enumerados.</small></label>
          <label className="checkbox-label"><input type="checkbox" checked={form.codeWithAi} disabled={busy} onChange={event=>setForm({...form,codeWithAi:event.target.checked,consent:event.target.checked?form.consent:false})}/>Usar IA en las revisiones programadas</label>
          {form.codeWithAi&&<><AgentModelSelect id="scheduled-model" models={provider?.connection.models??[]} value={form.model??''} disabled={busy||provider?.connection.status!=='connected'} onChange={value=>setForm({...form,model:value||null,reasoningEffort:null,consent:false})}/><ReasoningSelect id="scheduled-reasoning" model={provider?.connection.models.find(model=>model.slug===form.model)} value={(form.reasoningEffort??'') as ReasoningEffort|''} disabled={busy} onChange={value=>setForm({...form,reasoningEffort:value||null,consent:false})}/>{provider?.connection.status!=='connected'&&<p className="form-error">Conecta ChatGPT o inicia Ollama y actualiza la programación para seleccionar un modelo.</p>}<label className="checkbox-label"><input type="checkbox" required checked={form.consent} disabled={busy} onChange={event=>setForm({...form,consent:event.target.checked})}/>Autorizo enviar los archivos seleccionados automáticamente a {providerDestination(form.model)}.</label></>}
          <div className="settings-form-footer">
            <p role="status" className="muted">{dirty?'Cambios sin guardar. La próxima ejecución actual corresponde a la versión guardada.':'Configuración guardada.'}</p>
            <button className="save-settings-btn" disabled={busy||!form.codeDays?.length||form.codeWithAi&&(!form.consent||!form.model||provider?.connection.status!=='connected')} type="submit">{busy?'Guardando…':'Guardar automatización'}</button>
          </div>
        </form>
      </div>
    )}
    {mode!=="configuration"&&data&&(
      <div className="settings-section-card operations-history-card">
        <h3 className="settings-card-title">Historial de automatización ({data.runs.length})</h3>
        {!data.runs.length ? (
          <p className="muted">Aún no se han ejecutado operaciones programadas.</p>
        ) : (
          <div className="operations-runs-list">
            {data.runs.map(run => (
              <article key={run.id} className="operation-run-item">
                <div className="run-header">
                  <strong>{run.kind==='sources'?'Lectura de fuentes':'Revisión de código'}</strong>
                  <span className="muted">{date(run.started_at)}</span>
                  <span className={`status-pill ${run.status}`}>
                    {({succeeded:'Solicitud procesada',partial:'Cobertura parcial',failed:'No completada',suspended:'Suspendida por permisos',started:'En curso'} as Record<string,string>)[run.status]??run.status}
                  </span>
                </div>
                <details className="run-details-accordion">
                  <summary>Alcance y referencias</summary>
                  <pre>{JSON.stringify(run.detail,null,2)}</pre>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
    )}
  </section>;
}
