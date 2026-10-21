import { useEffect, useState } from 'react';
type Job = {
    reviewedUnits?: number;
    id: string;
    target: string;
    status: string;
    state: string;
    createdAt: string;
    finishedAt: string | null;
    lastActivity: string;
    completed: string[];
    errorCode: string | null;
};
const stages = [['executor', 'Ejecutor'], ['reviewer', 'Revisor'], ['approver', 'Aprobador']];
const states: Record<string, string> = { draft: 'Preparando contexto', in_review: 'Revisor: esperando proveedor', in_policy_check: 'Aprobador: esperando proveedor', pending_review: 'Revisor: esperando proveedor', pending_policy_check: 'Aprobador: esperando proveedor', pending_human_approval: 'Esperando decisión del gestor', authorized: 'Autorizada; ejecución separada', changes_requested: 'Ajustes solicitados', rejected: 'Rechazada', invalidated: 'Invalidada', executed: 'Cambio verificado', executing: 'Aplicando cambio' };
export function WorkProgress({ projectId }: {
    projectId: string;
}) {
    const [jobs, setJobs] = useState<Job[]>([]), [error, setError] = useState(false), [now, setNow] = useState(Date.now()), [threshold, setThreshold] = useState(120);
    useEffect(() => { const controller = new AbortController(); let active = false; async function load() { if (active)
        return; active = true; try {
        const response = await fetch(`/api/v1/projects/${projectId}/work-progress`, { signal: controller.signal });
        if (!response.ok)
            throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
            setJobs(result.jobs);
            setError(false);
        }
    }
    catch {
        if (!controller.signal.aborted)
            setError(true);
    }
    finally {
        active = false;
    } } void load(); const timer = setInterval(() => { setNow(Date.now()); void load(); }, 5000); return () => { controller.abort(); clearInterval(timer); }; }, [projectId]);
    const current = jobs.filter(job => ['running', 'queued'].includes(job.status));
    return <details className="work-progress" open={current.length > 0 || error}><summary>Actividad de los agentes <span className="badge">{current.length ? `${current.length} en curso` : 'Sin ejecuciones activas'}</span></summary><label className="muted">Avisar tras <select value={threshold} onChange={event => setThreshold(Number(event.target.value))}>{[60, 120, 180, 300].map(seconds => <option key={seconds} value={seconds}>{seconds / 60} min</option>)}</select> sin novedades (solo aviso)</label>{error && <p role="status">No se pudo consultar el servidor. El estado puede haber cambiado; no se ha repetido ningún trabajo.</p>}{[...jobs].sort((a, b) => Number(['running', 'queued'].includes(b.status)) - Number(['running', 'queued'].includes(a.status))).slice(0, 5).map(job => <article key={job.id} className="work-progress-job"><div><strong>{({ code: 'Corrección de código', proposals: 'Propuesta Trello', analysis: 'Análisis de código', supervision: 'Lectura y supervisión', report: 'Generación de informe', coverage: 'Cobertura por fragmentos' } as Record<string, string>)[job.target] ?? 'Trabajo'}</strong> · {job.status === 'running' ? (states[job.state] ?? 'Ejecutor: esperando proveedor') : job.status === 'interrupted' ? 'Interrumpido; consultar recuperación' : job.status === 'failed' ? 'Fallido' : states[job.state] ?? 'Etapas finalizadas'}</div>{['code', 'proposals'].includes(job.target) && <ol className="agent-stepper">{stages.map(([key, label]) => <li key={key} className={job.completed.includes(key!) ? 'is-complete' : ''}>{job.completed.includes(key!) ? '✓ ' : ''}{label}</li>)}</ol>}{job.reviewedUnits !== undefined && <p>{job.reviewedUnits} fragmentos confirmados en esta tanda. El límite configurado es un presupuesto, no un total conocido de trabajo pendiente.</p>}{job.status === 'running' && <><progress aria-label="Esperando respuesta del proveedor"/><p className="muted">{Math.max(0, Math.floor((now - Date.parse(job.createdAt)) / 1000))} s transcurridos · última evidencia de etapa: {new Date(job.lastActivity).toLocaleTimeString('es-EC')}. La consulta del panel no acredita avance interno del modelo.</p>{now - Date.parse(job.lastActivity) > threshold * 1000 && <p role="status">Sin novedades; comprobando estado. Esto no confirma un bloqueo. El timeout del proveedor determina el fallo.</p>}</>}{job.errorCode && <p className="form-error">{job.errorCode}</p>}</article>)}{!jobs.length && !error && <p>No hay trabajos registrados. Puedes iniciar una propuesta desde su pantalla.</p>}</details>;
}
