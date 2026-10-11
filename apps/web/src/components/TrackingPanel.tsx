import { useEffect, useState } from 'react';
import type { TrackingResponse } from '@dev-project-agent/contracts';
import { TrackingSettings } from './TrackingSettings';

const attention = { immediate: 'Atención inmediata', upcoming: 'Atención próxima', review: 'Revisar datos', none: 'Sin alerta' };
const findingNames = { overdue: 'Vencimiento superado', due_soon: 'Próximo vencimiento', blocked: 'Bloqueo informado', data_quality: 'Calidad de datos' };
const states: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Completada declarada', unknown: 'Sin estado válido' };
const issueNames: Record<string, string> = {
  missing_state: 'Estado ausente', conflicting_state: 'Etiquetas de estado contradictorias', missing_or_conflicting_state: 'Estado sin determinar',
  missing_due: 'Vencimiento ausente', missing_start: 'Inicio ausente', missing_assignee: 'Sin miembros asignados', unresolved_assignee: 'Miembro asignado sin resolver',
  completion_conflict: 'Estado y marca de finalización contradictorios', invalid_schedule: 'Inicio posterior al vencimiento',
  invalid_due: 'Vencimiento inválido o sin zona horaria', invalid_start: 'Inicio inválido o sin zona horaria',
  conflicting_priority: 'Prioridades contradictorias', completed_with_block: 'Completada con bloqueo informado',
  missing_wbs:'Código WBS ausente', duplicate_wbs:'Código WBS duplicado entre elementos activos',
};
const fields: Record<string, string> = { state: 'Estado', due: 'Vencimiento', start: 'Inicio', dueComplete: 'Marca de finalización', qualityIssues: 'Observaciones', labelNames: 'Etiquetas', memberIds: 'IDs de miembros asignados' };
const date = (value: string) => new Date(value).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
function evidenceValue(field: string, value: string | boolean | string[] | null) {
  if (value === null) return 'Sin informar';
  if (Array.isArray(value)) return value.length ? value.map(item => field === 'qualityIssues' ? issueNames[item] ?? item : item).join(', ') : 'Sin informar';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (field === 'due' || field === 'start') return Number.isFinite(Date.parse(value)) ? date(value) : 'Fecha inválida';
  return field === 'state' ? states[value] ?? value : value;
}

export function TrackingPanel({ projectId, canManage, csrfToken }: { projectId: string; canManage: boolean; csrfToken: string }) {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const response = await fetch(`/api/v1/projects/${projectId}/tracking`, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to read tracking.');
        const value = await response.json() as TrackingResponse;
        if (!controller.signal.aborted) { setData(value); setError(''); }
      } catch { if (!controller.signal.aborted) setError('No se pudo actualizar la evaluación. Comprueba tu sesión.'); }
      finally { running = false; }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [projectId, attempt]);
  const findings = data?.findings.filter(item => filter === 'all' || item.attention === filter) ?? [];
  return <div className="tracking-panel" aria-labelledby="tracking-title">
    <h3 id="tracking-title">Retrasos y riesgos de seguimiento</h3>
    <TrackingSettings projectId={projectId} canManage={canManage} csrfToken={csrfToken} onSaved={() => setAttempt(value => value + 1)} />
    {error && <p role="alert" className="form-error">{error} {data && 'La evaluación mostrada corresponde al corte anterior.'}</p>}
    {!data && !error && <p role="status">Evaluando la lectura guardada…</p>}
    <button onClick={() => setAttempt(value => value + 1)}>Reevaluar datos guardados</button>
    {data && <>
      <p className="muted">Evaluado: {date(data.evaluatedAt)}. Próximos vencimientos: {data.policy.dueSoonHours} horas. Configuración utilizada: {data.policy.version}.</p>
      {!data.policy.thresholdsConfirmed && <p className="muted">Umbrales iniciales propuestos: {data.policy.dueSoonHours} horas para próximos vencimientos y {data.policy.staleAfterMinutes} minutos para advertir antigüedad.</p>}
      {data.source && data.source.freshness !== 'recent' && <p role="status" className="form-error">{data.source.freshness === 'historical' ? 'Esta fuente es una exportación histórica.' : data.source.freshness === 'invalid' ? 'La fecha de la fuente no es válida para este corte.' : 'La lectura de Trello está desactualizada.'} Última observación: {date(data.source.observedAt)}. Los hallazgos no acreditan el estado actual del tablero.</p>}
      {data.source?.lastAttemptFailed && <p className="form-error">La última sincronización falló. Se está evaluando la última lectura válida.</p>}
      {data.summary ? <>
        <div className="tracking-metrics">
          <p><strong>{data.summary.progress.percent === null ? 'No disponible' : `${data.summary.progress.percent.toLocaleString('es-EC')} %`}</strong><br />Avance declarado: {data.summary.progress.numerator}/{data.summary.progress.denominator} actividades</p>
          <p><strong>{data.summary.activities.overdue}</strong><br />Actividades con vencimiento superado</p>
          <p><strong>{data.summary.activities.dueSoon}</strong><br />Actividades próximas a vencer</p>
          <p><strong>{data.summary.activities.notEvaluable}</strong><br />Actividades no evaluables por fecha/estado</p>
        </div>
        <p>{data.summary.activities.pending} pendientes · {data.summary.activities.inProgress} en curso · {data.summary.activities.completedDeclared} completadas declaradas · {data.summary.activities.unknown} sin estado válido.</p>
        <p>Hitos: {data.summary.milestones.completedDeclared}/{data.summary.milestones.total} completados declarados; {data.summary.milestones.overdue} vencidos y {data.summary.milestones.dueSoon} próximos. No forman parte del porcentaje de actividades.</p>
        <p>Bloqueo: {data.summary.activities.blocked} actividades con señal explícita; {data.summary.activities.blockingUnknown} sin información de bloqueo.</p>
        <p>Prioridad no informada: {data.items.filter(item => item.priority === null).length} elementos. La atención de una alerta no asigna una prioridad a la actividad.</p>
        <p>{data.summary.affectedItems} elementos requieren atención. Cada elemento se cuenta una sola vez aunque tenga varias alertas.</p>
        <label className="tracking-filter">Filtrar alertas <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">Todas</option><option value="immediate">Atención inmediata</option><option value="upcoming">Atención próxima</option><option value="review">Revisar datos</option>
        </select></label>
        {!findings.length && <p>{data.findings.length ? 'No hay alertas para este filtro.' : 'No se detectaron alertas con estas reglas y esta lectura. Esto no garantiza ausencia de riesgos.'}</p>}
        <div className="work-items">{findings.map(finding => <article className="work-item" key={finding.id}>
          <div className="section-heading"><h4>{finding.itemName}</h4><span className="badge">{attention[finding.attention]}</span></div>
          <p><strong>{findingNames[finding.code]}</strong> · {finding.kind === 'milestone' ? 'Hito' : 'Actividad'}</p>
          <p>{finding.message}</p>
          <details><summary>Ver evidencia</summary><dl>{finding.evidence.map((fact, index) => <div key={index}><dt>{fields[fact.field] ?? fact.field}</dt><dd>{evidenceValue(fact.field, fact.value)}</dd></div>)}</dl>
            <p className="muted">Fuente: {data.source?.snapshotId}; política: {data.policy.version}. Impacto en otras tareas: no evaluado.</p></details>
        </article>)}</div>
      </> : <p>No hay una lectura válida para evaluar.</p>}
      <details><summary>Reglas y límites de esta evaluación</summary><ul>{data.limitations.map(value => <li key={value}>{value}</li>)}</ul>
        <p>Fórmula: actividades con etiqueta de completada / actividades activas × 100. Archivadas, referencias e hitos se excluyen. La marca de finalización contradictoria genera una advertencia.</p></details>
    </>}
  </div>;
}
