import { useEffect, useState } from 'react';
import type { TrelloOverview, ProjectAccess } from '@dev-project-agent/contracts';
import { TrackingPanel } from './TrackingPanel';

const states = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Completada declarada', unknown: 'Sin estado válido' };
const fields: Record<string, string> = { name: 'Nombre', listId: 'Lista', kind: 'Tipo', state: 'Estado', labelNames: 'Etiquetas', start: 'Inicio', due: 'Vencimiento', dueComplete: 'Marca de finalización', archived: 'Archivo', memberIds: 'Responsables', planning:'Descripción y planificación detallada', added: 'Tarjeta incorporada', not_observed: 'Tarjeta no observada' };
function date(value: string | null) { return value ? new Date(value).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : 'Sin informar'; }

export function TrelloPanel({ project, csrfToken }: { project: ProjectAccess; csrfToken: string }) {
  const [data, setData] = useState<TrelloOverview | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const path = `/api/v1/projects/${project.id}/trello`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    void fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to read Trello overview.');
      return response.json() as Promise<TrelloOverview>;
    }).then(setData).catch(() => { if (!controller.signal.aborted) setError('No se pudo cargar el seguimiento. Comprueba tu sesión y vuelve a intentar.'); });
    return () => controller.abort();
  }, [path, attempt]);
  const latest = data?.latest;
  const items = latest?.data.items.filter(item => !item.archived && item.kind !== 'reference') ?? [];
  const visible = showAll ? items : items.slice(0, 12);
  const memberName = (id: string) => latest?.data.members.find(member => member.id === id)?.displayName ?? 'Miembro sin resolver';
  return <section aria-labelledby="trello-title">
    <div className="section-heading"><h2 id="trello-title">Planificación de Trello</h2>{latest && <span className="badge">{latest.source === 'export' ? 'Exportación local · sin conexión en vivo' : 'Lectura de Trello'}</span>}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data && !error && <p role="status">Cargando planificación…</p>}
    {!data && error && <button onClick={() => setAttempt(value => value + 1)}>Reintentar</button>}
    {data && <>
      {!data.connection.apiConfigured && <p className="muted">La conexión en línea está pendiente de configuración por el gestor.</p>}
      {project.canManageProject && <p className="muted">Solicita la actualización desde «Supervisión e historial» para conservar el estado y las etapas del trabajo.</p>}
      {data.lastAttempt?.status === 'failed' && <p role="status" className="form-error">La última actualización falló ({date(data.lastAttempt.attemptedAt)}). Los datos anteriores se conservan.</p>}
      {!latest && <p>No hay lecturas guardadas todavía.</p>}
      {latest && <>
        <TrackingPanel key={latest.id} projectId={project.id} canManage={project.canManageProject} csrfToken={csrfToken} />
        <p><strong>{latest.data.board.name}</strong></p>
        <p className="muted">{latest.source === 'export' ? 'Fecha de referencia del archivo' : 'Consulta finalizada'}: {date(latest.observedAt)}. Guardado: {date(latest.importedAt)}.</p>
        <p>{items.filter(item => item.kind === 'activity').length} actividades · {items.filter(item => item.kind === 'milestone').length} hitos. Las referencias y tarjetas archivadas se conservan fuera de esta vista.</p>
        <div className="work-items">{visible.map(item => <article className="work-item" key={item.id}>
          <div className="section-heading"><h3>{item.name}</h3><span className="badge">{item.kind === 'milestone' ? 'Hito' : 'Actividad'}</span></div>
          <p>{states[item.state]} · {latest.data.lists.find(list => list.id === item.listId)?.name}</p>
          <p>Inicio: {date(item.start)}<br />{item.kind === 'milestone' ? 'Instante del hito' : 'Vencimiento'}: {date(item.due)}</p>
          <p>Asignados: {item.memberIds.length ? item.memberIds.map(memberName).join(', ') : 'Sin informar'}</p>
          {item.planning&&<details><summary>Planificación y checklists</summary>
            <p>WBS: {item.planning.wbs??'Sin informar'}<br/>Responsable principal declarado: {item.planning.principal??'Sin informar'}</p>
            <p>Predecesoras: {item.planning.dependencyDeclaration==='none'?'Ninguna, declarado explícitamente':item.planning.dependencyDeclaration==='provided'?item.planning.dependencies.map(dependency=>`${dependency.wbs} (${dependency.relation==='finish_start'?'Fin–Inicio':'Inicio–Inicio'}, ${dependency.lagHours} horas${dependency.itemId?'':', sin resolver'})`).join('; '):'Sin información interpretable'}</p>
            {item.planning.checklists.map(checklist=><div key={checklist.id}><h4>{checklist.name}</h4><ul>{checklist.items.map(entry=><li key={entry.id}>{entry.completedDeclared?'Completado declarado':'Pendiente'} · {entry.name}</li>)}</ul></div>)}
            {!item.planning.checklists.length&&<p>Sin checklists en esta lectura.</p>}
            <details><summary>Descripción original</summary><p className="source-description">{item.planning.description||'Sin descripción'}</p></details>
          </details>}
          {item.qualityIssues.length > 0 && <p className="form-error">Datos pendientes de revisión: {item.qualityIssues.length}. No se infieren valores faltantes.</p>}
        </article>)}</div>
        {items.length > 12 && <button onClick={() => setShowAll(value => !value)}>{showAll ? 'Mostrar menos' : `Mostrar los ${items.length} elementos`}</button>}
        <h3>Cambios frente a la lectura anterior</h3>
        {latest.changes.length === 0 ? <p className="muted">Sin cambios registrados; la primera lectura establece la referencia de comparación.</p> : <>
          <p>{latest.changes.length} cambios de campos detectados.</p>
          <ul>{latest.changes.slice(0, 30).map((change, index) => <li key={index}>{change.itemName}: {fields[change.field] ?? 'Campo actualizado'}</li>)}</ul>
          {latest.changes.length > 30 && <p className="muted">Se muestran los primeros 30 cambios.</p>}
        </>}
        <p className="muted">Esta lectura conserva estados declarados. No representa aceptación formal ni una línea base aprobada.</p>
      </>}
    </>}
  </section>;
}
