import {useCallback,useEffect,useRef,useState} from 'react';
import type {ProjectAccess,ReportDetail,ReportsOverview} from '@dev-project-agent/contracts';
const date=(value:string)=>new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'});
const statuses={queued:'En cola',published:'Publicado · validación automática',draft:'Borrador · requiere evidencia',failed:'No generado'};
const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export function ReportsPanel({project,csrfToken}:{project:ProjectAccess;csrfToken:string}) {
  const [data,setData]=useState<ReportsOverview|null>(null),[detail,setDetail]=useState<ReportDetail|null>(null),[selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[weekday,setWeekday]=useState(5),[time,setTime]=useState('18:00');
  const requestKey=useRef<{revisionOf:string|null;key:string}|null>(null),settingsVersion=useRef<number|null>(null);
  const prefix=`/api/v1/projects/${project.id}/reports`;
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(prefix,signal?{signal}:{});if(!response.ok)throw new Error();const next=await response.json() as ReportsOverview;if(signal?.aborted)return;
    let report:ReportDetail|null=null;
    if(selected){const result=await fetch(prefix+'/'+selected,signal?{signal}:{});if(!result.ok)throw new Error();report=await result.json() as ReportDetail;}
    if(signal?.aborted)return;
    // Commit list and detail together so stopping queue polling cannot abort its final detail read.
    if(report)setDetail(report);setData(next);
    if(settingsVersion.current!==next.schedule.version){settingsVersion.current=next.schedule.version;setEnabled(next.schedule.enabled);setWeekday(next.schedule.weekday);setTime(`${String(next.schedule.hour).padStart(2,'0')}:${String(next.schedule.minute).padStart(2,'0')}`);}
  },[prefix,selected]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError('No se pudieron consultar los reportes. Vuelve a actualizar.');});return()=>controller.abort();},[load]);
  const queued=data?.reports.some(report=>report.status==='queued')??false;
  useEffect(()=>{if(!queued)return;const controller=new AbortController();let pending=false;const timer=setInterval(()=>{if(pending)return;pending=true;void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError('No se pudo actualizar el reporte.');}).finally(()=>{pending=false;});},2500);return()=>{clearInterval(timer);controller.abort();};},[queued,load]);
  async function generate(revisionOf:string|null=null) {
    if(busy)return;setBusy(true);setError('');setNotice('');
    if(requestKey.current?.revisionOf!==revisionOf)requestKey.current={revisionOf,key:crypto.randomUUID()};
    try{const response=await fetch(prefix,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({requestKey:requestKey.current!.key,...(revisionOf?{revisionOf}:{})})});const body=await response.json();if(!response.ok){setError(body.message??'No se pudo solicitar el reporte.');return;}requestKey.current=null;setSelected(body.id);setDetail(null);setNotice('Reporte solicitado. Se prepara y revisa con las evidencias guardadas.');}catch{setError('No se pudo confirmar la solicitud. Actualiza antes de volver a intentar.');}finally{setBusy(false);}
  }
  async function save(){if(!data||busy)return;setBusy(true);setError('');setNotice('');try{const [hour,minute]=time.split(':').map(Number);const response=await fetch(prefix+'/schedule',{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({expectedVersion:data.schedule.version,enabled,weekday,hour,minute})});const body=await response.json();if(!response.ok){setError(body.message??'No se pudo guardar la programación.');return;}setNotice('Programación guardada. El servicio recuperará los cortes pendientes cuando esté encendido.');await load();}catch{setError('No se pudo confirmar la programación. Actualiza el panel.');}finally{setBusy(false);}}
  return <section aria-labelledby="reports-title" className="reports-panel">
    <div className="section-heading"><h2 id="reports-title">Reportes semanales</h2><button disabled={busy} onClick={()=>{setError('');void load().catch(()=>setError('No se pudieron actualizar los reportes.'));}}>Actualizar reportes</button></div>
    <p className="muted">Avance, desviaciones, riesgos, calidad de código y decisiones en una versión guardada. Preparación, revisión y publicación mediante reglas deterministas. No consume ChatGPT ni envía mensajes externos.</p>
    {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!data?<p>Consultando reportes…</p>:<>
      <p>Programación: <strong>{data.schedule.enabled?`${weekdays[data.schedule.weekday]} a las ${String(data.schedule.hour).padStart(2,'0')}:${String(data.schedule.minute).padStart(2,'0')}`:'Sin activar'}</strong> · America/Guayaquil.{data.schedule.nextCutoff&&` Próximo corte: ${date(data.schedule.nextCutoff)}.`}</p>
      {data.schedule.errorCode&&<p role="alert" className="form-error">Programación suspendida porque cambió la autoridad del gestor que la activó. Un gestor vigente debe guardar nuevamente la configuración.</p>}
      {project.canManageProject&&<>
        <details className="report-settings"><summary>Configurar programación semanal</summary><div className="report-schedule-form">
          <label className="confirmation"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)} disabled={busy}/>Activar generación semanal en este equipo</label>
          <label htmlFor="report-weekday">Día del reporte</label><select id="report-weekday" value={weekday} onChange={event=>setWeekday(Number(event.target.value))} disabled={busy}>{weekdays.map((name,index)=><option key={name} value={index}>{name}</option>)}</select>
          <label htmlFor="report-time">Hora del reporte (Ecuador)</label><input id="report-time" type="time" required value={time} onChange={event=>setTime(event.target.value)} disabled={busy}/>
          <p className="muted">Valor acordado: viernes 18:00. El equipo y el servicio deben estar encendidos. Tras un apagado se recuperan los cortes originales; una lectura posterior se identifica expresamente.</p>
          <button onClick={()=>void save()} disabled={busy||!time}>Guardar programación</button>
        </div></details>
        <button disabled={busy||queued} onClick={()=>void generate()}>{queued?'Preparando reporte…':'Generar reporte ahora'}</button>
      </>}
      {!data.reports.length&&<p>Aún no hay reportes guardados.</p>}
      <div className="work-items">{data.reports.map(report=><article className="work-item" key={report.id}><h3>{date(report.cutoff)} · Versión {report.version}</h3><p>{statuses[report.status]} · {report.kind==='scheduled'?'Programado':'Manual'}</p><button disabled={busy} onClick={()=>{setSelected(report.id);setDetail(null);}}>Abrir reporte</button></article>)}</div>
      {selected&&<div className="report-detail"><h3>Detalle del reporte{detail&&` · Versión ${detail.version}`}</h3>{!detail?<p>Cargando reporte…</p>:<>
        <p><strong>{statuses[detail.status]}</strong>. Periodo: {date(detail.periodStart)} — {date(detail.cutoff)}.</p>
        {detail.errorCode&&<p className="form-error">{detail.errorCode==='FORBIDDEN'?'La autoridad del gestor cambió; la generación se detuvo.':'La generación falló. Puedes solicitar otra versión y conservar este registro.'}</p>}
        {detail.data&&<><p>{detail.data.executiveSummary}</p><p className="muted">{detail.data.late?'Generado con retraso. ':''}{detail.data.partialPeriod?'Periodo parcial. ':''}{detail.data.sources.some(source=>source.timing==='after_cutoff')?'Incluye evidencia posterior al corte; no reconstruye el estado histórico.':''}</p>
          <p><a href={prefix+'/'+detail.id+'/print'} target="_blank" rel="noopener noreferrer">Abrir versión imprimible / guardar como PDF</a></p>
          <details><summary>Ver fuentes, limitaciones y revisión</summary><ul>{detail.data.limitations.map((value,index)=><li key={index}>{value}</li>)}</ul>{detail.data.stages.map(stage=><p key={stage.stage}>{stage.stage==='executor'?'Ejecutor':stage.stage==='reviewer'?'Revisor':'Aprobador'}: {stage.outcome==='pass'?'Superado':'Requiere evidencia'} · reglas deterministas.</p>)}<p className="content-hash">Huella: {detail.contentHash}</p></details>
          <details><summary>Vista previa del reporte completo</summary><iframe title="Vista previa del reporte semanal" src={prefix+'/'+detail.id+'/print'} sandbox="allow-same-origin" className="report-preview"/></details>
        </>}
        {project.canManageProject&&detail.status!=='queued'&&<button disabled={busy||queued} onClick={()=>void generate(detail.id)}>Preparar nueva versión del mismo periodo</button>}
      </>}</div>}
    </>}
  </section>;
}
