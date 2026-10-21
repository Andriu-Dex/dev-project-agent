import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BaselineVersion,
  GitHubOverview,
  ProjectAccess,
  SupervisionOverview,
  SupervisionRun,
  SupervisionJobKind,
} from '@dev-project-agent/contracts';
import { Icon } from './Workspace';
import { Pagination } from './Pagination';

interface BaselineOverview {
  baseline: BaselineVersion | null;
  candidate: {
    snapshotId: string;
    source: 'api' | 'export';
    observedAt: string;
    activities: number;
    milestones: number;
  } | null;
}

interface EventItem {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: string;
  created_at: string;
  actor: string | null;
}

interface OperationsOverview {
  configuration: {
    version: number;
    enabled: boolean;
    intervalMinutes: number;
    codeEnabled: boolean;
    codeHour: number;
    codeMinute?: number;
    codeDays?: number[];
    codeWithAi: boolean;
    model: string | null;
    reasoningEffort: string | null;
    consent: boolean;
    maxFiles: number;
  };
  cursor: {
    next_sync: string | null;
    next_code: string | null;
    last_error: string | null;
  } | null;
  runs: {
    id: string;
    kind: string;
    status: string;
    started_at: string;
    detail: unknown;
  }[];
}

const dates = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sin registrar';

const statusNames: Record<string, { label: string; badgeClass: string }> = {
  queued: { label: 'En espera', badgeClass: 'draft' },
  running: { label: 'En ejecución', badgeClass: 'executing' },
  succeeded: { label: 'Completado', badgeClass: 'executed' },
  partial: { label: 'Parcial', badgeClass: 'changes-requested' },
  failed: { label: 'Falló', badgeClass: 'rejected' },
  complete: { label: 'Completo', badgeClass: 'executed' },
};

const kindNames: Record<SupervisionJobKind, { title: string; desc: string; icon: string }> = {
  full: {
    title: 'Actualizar todo y analizar',
    desc: 'Lee Trello, GitHub y calcula dependencias y desviaciones de línea base.',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  trello_sync: {
    title: 'Sincronizar Trello',
    desc: 'Descarga tableros, listas, tarjetas, fechas, responsables y dependencias.',
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
  },
  github_sync: {
    title: 'Sincronizar GitHub',
    desc: 'Consulta la rama supervisada, commits recientes y archivos modificados.',
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  },
  analysis: {
    title: 'Analizar lecturas guardadas',
    desc: 'Reevalúa las lecturas actuales frente a las reglas y la línea base.',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
};

const stages: Record<string, string> = {
  trello: 'Trello',
  github: 'GitHub',
  analysis: 'Análisis',
  supervision: 'Supervisión',
  recovery: 'Recuperación',
};

const outcomes: Record<string, string> = {
  started: 'Iniciado',
  succeeded: 'Completado',
  failed: 'Falló',
  recovered: 'Recuperado',
  denied: 'Denegada',
  requested: 'Solicitada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  changes_requested: 'Ajustes solicitados',
  invalidated: 'Invalidada',
  source_changed: 'Fuente modificada',
  simulated: 'Simulada',
  uncertain: 'Resultado incierto',
};

const resources: Record<string, string> = {
  proposal: 'Propuesta de Trello',
  code_review: 'Revisión de código',
  execution_job: 'Ejecución Trello',
  github_publication: 'Publicación GitHub',
  project_alert: 'Alerta',
  operation_configuration: 'Automatización',
  tracking_policy_version: 'Reglas de seguimiento',
  supervision_job: 'Supervisión',
  report_job: 'Reporte',
};

const fields: Record<string, string> = {
  name: 'Nombre',
  kind: 'Tipo',
  state: 'Estado',
  labelNames: 'Etiquetas',
  start: 'Inicio',
  due: 'Vencimiento',
  memberIds: 'Asignados',
  wbs: 'WBS',
  principal: 'Responsable principal',
  dependencies: 'Dependencias',
  added: 'Incorporado',
  not_observed: 'Fuera de alcance',
};

const errors: Record<string, string> = {
  RATE_LIMITED: 'El proveedor alcanzó su límite de consultas.',
  ACCESS_DENIED: 'El proveedor rechazó el acceso.',
  CREDENTIALS_REQUIRED: 'Faltan credenciales de Trello.',
  BRANCH_NOT_FOUND: 'No se encontró la rama configurada.',
  NOT_FOUND: 'El recurso externo no está disponible.',
  SOURCE_UNAVAILABLE: 'La fuente no respondió.',
  FORBIDDEN: 'Los permisos del gestor cambiaron.',
  NO_DATA: 'No hay fuentes válidas.',
  LEASE_LOST: 'El trabajo perdió su control de ejecución.',
  RECOVERY_EXHAUSTED: 'Se agotaron los intentos de recuperación.',
  COMPARISON_TOO_LARGE: 'La comparación excede el límite verificable de GitHub.',
};

const explain = (code: string | null) =>
  code ? errors[code] ?? 'No se pudo completar esta etapa. Consulta la configuración.' : '';

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'Sin informar';
  if (typeof val === 'string') {
    return (
      ({
        pending: 'Pendiente',
        in_progress: 'En curso',
        completed: 'Completada',
        activity: 'Actividad',
        milestone: 'Hito',
      } as Record<string, string>)[val] ?? val
    );
  }
  return JSON.stringify(val);
}

export function OperationsPage({
  project,
  csrfToken,
  onCompleted,
}: {
  project: ProjectAccess;
  csrfToken: string;
  onCompleted: () => void;
}) {
  const prefix = `/api/v1/projects/${project.id}`;

  // Data states
  const [data, setData] = useState<SupervisionOverview | null>(null);
  const [github, setGitHub] = useState<GitHubOverview | null>(null);
  const [baseline, setBaseline] = useState<BaselineOverview | null>(null);
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [events, setEvents] = useState<EventItem[] | null>(null);

  // Status & UI
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'supervision' | 'baseline' | 'automation' | 'history'>('supervision');

  // Selected Detail Modal/Drawer
  const [selectedRun, setSelectedRun] = useState<SupervisionRun | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [jobDetail, setJobDetail] = useState<{
    id: string;
    events: { stage: string; outcome: string; errorCode: string | null; createdAt: string }[];
  } | null>(null);

  // History search & pagination
  const [historySearch, setHistorySearch] = useState('');
  const [historyOutcomeFilter, setHistoryOutcomeFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const callbacks = useRef(onCompleted);
  callbacks.current = onCompleted;
  const previousActive = useRef(false);
  const retryRequest = useRef<{ kind: SupervisionJobKind; key: string } | null>(null);

  const active = data?.jobs.some(job => job.status === 'queued' || job.status === 'running') ?? false;

  const accept = useCallback((next: SupervisionOverview) => {
    if (previousActive.current && !next.jobs.some(job => job.status === 'queued' || job.status === 'running')) {
      setRefresh(number => number + 1);
      callbacks.current();
    }
    previousActive.current = next.jobs.some(job => job.status === 'queued' || job.status === 'running');
    setData(next);
  }, []);

  // Fetch all primary operational datasets
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`${prefix}/supervision`, { signal: controller.signal }).then(r => r.json()),
      fetch(`${prefix}/github`, { signal: controller.signal }).then(r => r.json()),
      fetch(`${prefix}/baseline`, { signal: controller.signal }).then(r => r.json()),
      fetch(`${prefix}/operations`, { signal: controller.signal }).then(r => r.json()),
      fetch(`${prefix}/history`, { signal: controller.signal }).then(r => r.json()),
    ])
      .then(([supervision, githubData, baselineData, opsData, histData]) => {
        if (!controller.signal.aborted) {
          accept(supervision);
          setGitHub(githubData);
          setBaseline(baselineData);
          setOperations(opsData);
          setEvents(histData.events ?? []);
          setError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('No se pudo actualizar el estado de operaciones. Se conservan los datos previos.');
        }
      });
    return () => controller.abort();
  }, [prefix, refresh, accept]);

  // Active polling while jobs are running
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let loading = false;
    const timer = setInterval(() => {
      if (loading) return;
      loading = true;
      void fetch(`${prefix}/supervision`, { signal: controller.signal })
        .then(async r => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then(next => {
          if (!controller.signal.aborted) accept(next);
        })
        .catch(() => {})
        .finally(() => {
          loading = false;
        });
    }, 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [prefix, active, accept]);

  // ESC to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedRun) setSelectedRun(null);
        if (jobDetail) setJobDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRun, jobDetail]);

  // Enqueue a supervision job
  async function enqueue(kind: SupervisionJobKind) {
    if (busy || active) return;
    setBusy(true);
    setError('');
    setNotice('');
    if (retryRequest.current?.kind !== kind) {
      retryRequest.current = { kind, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch(`${prefix}/supervision/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ kind, requestKey: retryRequest.current.key }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? 'No se pudo solicitar el trabajo.');
        return;
      }
      retryRequest.current = null;
      setSelectedRun(null);
      setNotice(`Solicitud de ${kindNames[kind].title.toLowerCase()} registrada con éxito.`);
      setRefresh(n => n + 1);
    } catch {
      setError('No se pudo confirmar la solicitud. Actualiza antes de volver a intentar.');
    } finally {
      setBusy(false);
    }
  }

  // Confirm baseline version
  async function confirmBaseline() {
    if (!baseline?.candidate || !confirmation || busy || active) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${prefix}/baseline-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          expectedVersion: baseline.baseline?.version ?? 0,
          snapshotId: baseline.candidate.snapshotId,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? 'No se pudo confirmar la línea base.');
      } else {
        setConfirmation(false);
        setNotice('Nueva versión de línea base confirmada exitosamente.');
        setRefresh(n => n + 1);
        callbacks.current();
      }
    } catch {
      setError('No se pudo confirmar el guardado de la línea base.');
    } finally {
      setBusy(false);
    }
  }

  // Open job / run details
  async function openDetail(resource: 'runs' | 'jobs', id: string) {
    if (detailBusy) return;
    setDetailBusy(true);
    setError('');
    try {
      const response = await fetch(`${prefix}/supervision/${resource}/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error('No se pudo leer el detalle.');
      if (resource === 'runs') setSelectedRun(body as SupervisionRun);
      else setJobDetail({ id, events: body.events });
    } catch {
      setError('No se pudo cargar el detalle del recurso.');
    } finally {
      setDetailBusy(false);
    }
  }

  // Filtered History
  const filteredEvents = (events ?? []).filter(item => {
    if (historyOutcomeFilter !== 'all' && item.outcome !== historyOutcomeFilter) return false;
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      const matchAction = item.action.toLowerCase().includes(q);
      const matchResource = (resources[item.resource_type] ?? '').toLowerCase().includes(q);
      const matchId = item.resource_id.toLowerCase().includes(q);
      const matchActor = (item.actor ?? '').toLowerCase().includes(q);
      const matchOutcome = (outcomes[item.outcome] ?? '').toLowerCase().includes(q);
      if (!matchAction && !matchResource && !matchId && !matchActor && !matchOutcome) return false;
    }
    return true;
  });

  const totalHistoryPages = Math.max(1, Math.ceil(filteredEvents.length / historyPageSize));
  const safeHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);
  const paginatedEvents = filteredEvents.slice(
    (safeHistoryPage - 1) * historyPageSize,
    safeHistoryPage * historyPageSize
  );

  const currentRun = selectedRun ?? data?.latestRun;

  return (
    <div className="proposals-dashboard operations-dashboard">
      {/* Top Hero Banner matching proposals-hero-banner */}
      <section className="proposals-hero-banner">
        <div className="proposals-hero-main">
          <div className="proposals-live-badge">
            <span className="live-pulse-dot" />
            <span>OPERACIÓN Y SUPERVISIÓN · TRELLO & GITHUB</span>
          </div>
          <h2 className="proposals-hero-title">Operación y Supervisión Continua</h2>
          <p className="proposals-hero-subtitle">
            Sincronización periódica de Trello y GitHub, verificación de avance contra la línea base de
            planificación, trazabilidad de análisis y auditoría inmutable de eventos.
          </p>
        </div>

        <div className="proposals-hero-actions">
          <button
            type="button"
            className="proposals-refresh-btn"
            disabled={busy}
            onClick={() => {
              setError('');
              setRefresh(n => n + 1);
            }}
            title="Refrescar estado de supervisión"
          >
            <span className={busy ? 'spin-icon' : ''}>
              <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </span>
            <span>Actualizar</span>
          </button>

          {project.canManageProject && (
            <button
              type="button"
              className="proposals-new-btn"
              disabled={busy || active}
              onClick={() => void enqueue('full')}
              title="Lee Trello y GitHub, y genera un corte completo de supervisión"
            >
              {active ? (
                <>
                  <span className="spin-icon">
                    <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
                  </span>
                  <span>Sincronizando…</span>
                </>
              ) : (
                <>
                  <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  <span>Actualizar fuentes y analizar</span>
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* Global Alerts / Notices */}
      {error && (
        <div role="alert" className="proposals-error-banner">
          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div role="status" className="proposals-success-banner">
          <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          <span>{notice}</span>
        </div>
      )}

      {active && (
        <div role="status" className="proposals-hero-banner" style={{ padding: '16px 20px', background: 'rgba(37, 99, 235, 0.9)' }}>
          <div className="proposals-hero-main" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="spin-icon">
              <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Hay un trabajo de supervisión en ejecución. El estado se actualiza automáticamente al finalizar.
            </span>
          </div>
        </div>
      )}

      {/* 4 KPI Metric Cards */}
      <section className="proposals-kpi-grid" aria-label="Métricas de operación">
        <div className="proposals-kpi-card">
          <div className="kpi-icon-box total">
            <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Lectura de Trello</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">
                {baseline?.candidate ? `${baseline.candidate.activities} act.` : 'Sin lectura'}
              </strong>
              <span className="kpi-subtext">
                {baseline?.candidate ? `${baseline.candidate.milestones} hitos` : 'Pendiente'}
              </span>
            </div>
            {baseline?.candidate && (
              <small className="kpi-date-subtext">
                {dates(baseline.candidate.observedAt)}
              </small>
            )}
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box progress">
            <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Código en GitHub</span>
            <div className="kpi-value-row">
              <strong className="kpi-number" style={{ fontSize: '15px' }}>
                {github?.connection ? github.connection.repository : 'Sin conectar'}
              </strong>
              {github?.connection && (
                <span className="kpi-subtext">
                  ({github.connection.branch})
                </span>
              )}
            </div>
            {github?.latest ? (
              <small className="kpi-date-subtext">
                HEAD {github.latest.data.head.slice(0, 8)} · {github.connection?.owner}
              </small>
            ) : (
              <small className="kpi-date-subtext">Sin lecturas</small>
            )}
          </div>
        </div>

        <div className={'proposals-kpi-card' + (baseline?.baseline ? '' : ' has-danger')}>
          <div className={'kpi-icon-box ' + (baseline?.baseline ? 'success' : 'danger')}>
            <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Línea Base Activa</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">
                {baseline?.baseline ? `Versión v${baseline.baseline.version}` : 'Sin confirmar'}
              </strong>
            </div>
            <small className="kpi-date-subtext">
              {baseline?.baseline
                ? `Por ${baseline.baseline.confirmedBy.displayName}`
                : 'Requiere confirmación del gestor'}
            </small>
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box success">
            <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Próxima Automatización</span>
            <div className="kpi-value-row">
              <strong className="kpi-number" style={{ fontSize: '13px' }}>
                {operations?.cursor?.next_sync ? dates(operations.cursor.next_sync) : 'Sin activar'}
              </strong>
            </div>
            <small className="kpi-date-subtext">
              {operations?.cursor?.next_code
                ? `Revisión código: ${dates(operations.cursor.next_code)}`
                : 'Horarios en Ecuador'}
            </small>
          </div>
        </div>
      </section>

      {/* Segmented Navigation Tabs */}
      <div className="code-tabs-container">
        <div className="code-nav-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'supervision'}
            className={'code-nav-tab-btn' + (activeTab === 'supervision' ? ' is-active' : '')}
            onClick={() => setActiveTab('supervision')}
          >
            <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            <span>Supervisión y Fuentes</span>
            <span className="code-tab-pill">{data?.runs.length ?? 0}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'baseline'}
            className={'code-nav-tab-btn' + (activeTab === 'baseline' ? ' is-active' : '')}
            onClick={() => setActiveTab('baseline')}
          >
            <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
            <span>Línea Base</span>
            <span className="code-tab-pill">{baseline?.baseline ? `v${baseline.baseline.version}` : '!'}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'automation'}
            className={'code-nav-tab-btn' + (activeTab === 'automation' ? ' is-active' : '')}
            onClick={() => setActiveTab('automation')}
          >
            <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
            <span>Trabajos y Tareas</span>
            <span className="code-tab-pill">{data?.jobs.length ?? 0}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={'code-nav-tab-btn' + (activeTab === 'history' ? ' is-active' : '')}
            onClick={() => setActiveTab('history')}
          >
            <Icon path="M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
            <span>Historial de Eventos</span>
            <span className="code-tab-pill">{events?.length ?? 0}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Supervisión y Fuentes */}
      {activeTab === 'supervision' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quick Sync Action Cards Grid */}
          {project.canManageProject && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {(Object.keys(kindNames) as SupervisionJobKind[]).map(k => {
                const item = kindNames[k];
                return (
                  <div
                    key={k}
                    className="proposals-kpi-card"
                    style={{
                      cursor: busy || active ? 'not-allowed' : 'pointer',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '16px',
                    }}
                    onClick={() => {
                      if (!busy && !active) void enqueue(k);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                      <div className="kpi-icon-box progress">
                        <Icon path={item.icon} />
                      </div>
                      <strong style={{ fontSize: '14px', flex: 1 }}>{item.title}</strong>
                    </div>
                    <p className="muted" style={{ margin: '8px 0 12px', fontSize: '12px', lineHeight: 1.4 }}>
                      {item.desc}
                    </p>
                    <button
                      type="button"
                      className="proposal-detail-trigger-btn"
                      disabled={busy || active}
                      style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                    >
                      <span>Ejecutar ahora</span>
                      <Icon path="M9 5l7 7-7 7" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Latest Supervision Result Card */}
          {currentRun ? (
            <div className="code-analysis-detail-card" style={{ marginTop: 0 }}>
              <header className="code-analysis-detail-header">
                <div>
                  <div className="proposal-meta-top">
                    <span
                      className={`proposal-status-badge ${
                        statusNames[currentRun.status]?.badgeClass ?? 'draft'
                      }`}
                    >
                      <span>{statusNames[currentRun.status]?.label ?? currentRun.status}</span>
                    </span>
                    <span className="proposal-version-chip">
                      Línea base: {currentRun.result.baselineVersion !== null ? `v${currentRun.result.baselineVersion}` : 'Sin confirmar'}
                    </span>
                    <span className="code-meta-chip">{dates(currentRun.createdAt)}</span>
                  </div>
                  <h3>Resultado del Corte de Supervisión</h3>
                </div>

                {selectedRun && (
                  <button
                    type="button"
                    className="editor-cancel-btn"
                    onClick={() => setSelectedRun(null)}
                  >
                    <span>Mostrar último análisis</span>
                  </button>
                )}
              </header>

              {/* Summary KPIs */}
              {currentRun.result.tracking?.summary && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    margin: '16px 0',
                  }}
                >
                  <div className="code-info-subcard">
                    <span className="subcard-title">Avance Declarado</span>
                    <strong style={{ fontSize: '18px', color: 'var(--color-accent)' }}>
                      {currentRun.result.tracking.summary.progress.percent?.toLocaleString('es-EC') ?? '0'}%
                    </strong>
                  </div>
                  <div className="code-info-subcard">
                    <span className="subcard-title">Actividades Vencidas</span>
                    <strong
                      style={{
                        fontSize: '18px',
                        color: currentRun.result.tracking.summary.activities.overdue > 0 ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {currentRun.result.tracking.summary.activities.overdue}
                    </strong>
                  </div>
                  <div className="code-info-subcard">
                    <span className="subcard-title">Próximas a Vencer</span>
                    <strong style={{ fontSize: '18px', color: '#d97706' }}>
                      {currentRun.result.tracking.summary.activities.dueSoon}
                    </strong>
                  </div>
                  <div className="code-info-subcard">
                    <span className="subcard-title">Frescura de la Fuente</span>
                    <p style={{ margin: 0, fontSize: '12px' }}>
                      {currentRun.result.tracking.source?.freshness === 'recent'
                        ? 'Lectura reciente oficial'
                        : 'Lectura histórica o de corte anterior'}
                    </p>
                  </div>
                </div>
              )}

              {/* Deviations vs Baseline */}
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                    Diferencias frente a la Línea Base ({currentRun.result.deviations.length})
                  </h4>
                  {currentRun.result.baselineVersion === null && (
                    <span className="proposal-status-badge changes-requested">Sin línea base confirmada</span>
                  )}
                </div>

                {!currentRun.result.deviations.length ? (
                  <p className="muted" style={{ fontSize: '13px' }}>
                    {currentRun.result.baselineVersion === null
                      ? 'Confirma una línea base para evaluar desviaciones temporales en este corte.'
                      : 'Sin desviaciones detectadas en los campos comparados.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentRun.result.deviations.map((dev, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: 'var(--color-bg-base)',
                          border: '1px solid var(--color-border)',
                          fontSize: '13px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{dev.itemName}</strong>
                          <span className="proposal-version-chip">{fields[dev.field] ?? dev.field}</span>
                        </div>
                        {dev.hoursShift !== null && (
                          <small style={{ color: '#d97706', display: 'block', margin: '4px 0' }}>
                            Desplazamiento: {dev.hoursShift.toLocaleString('es-EC')} horas
                          </small>
                        )}
                        <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '12px' }}>
                          <span className="muted">Antes: {formatValue(dev.before)}</span>
                          <span>→</span>
                          <strong>Corte: {formatValue(dev.after)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dependency Findings */}
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 700 }}>
                  Observaciones de Dependencias ({currentRun.result.dependencies.length})
                </h4>
                {!currentRun.result.dependencies.length ? (
                  <p className="muted" style={{ fontSize: '13px' }}>
                    No se detectaron inconsistencias en las relaciones declaradas.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentRun.result.dependencies.map((finding, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: 'var(--color-bg-base)',
                          border: '1px solid var(--color-border)',
                          fontSize: '13px',
                        }}
                      >
                        <strong>{finding.itemName}</strong>
                        <p style={{ margin: '4px 0', color: 'var(--color-text-base)' }}>{finding.message}</p>
                        {finding.predecessorWbs && (
                          <small className="muted">Predecesora WBS: {finding.predecessorWbs}</small>
                        )}
                        {finding.evidence.length > 0 && (
                          <details style={{ marginTop: '6px', fontSize: '12px' }}>
                            <summary style={{ cursor: 'pointer' }}>Ver evidencia de la relación</summary>
                            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                              {finding.evidence.map((ev, eIdx) => (
                                <li key={eIdx}>{ev}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GitHub Link from Run */}
              {currentRun.result.code && (
                <div style={{ marginTop: '20px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.04)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    <strong>GitHub supervisado:</strong> rama <code>{currentRun.result.code.branch}</code> · revisión{' '}
                    <code className="content-hash">{currentRun.result.code.head.slice(0, 10)}</code> ·{' '}
                    {currentRun.result.code.files.length} archivos en la comparación.{' '}
                    <a href="#code" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                      Examinar en Código →
                    </a>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="proposals-empty-state">
              <div className="empty-icon-shield">
                <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </div>
              <h3>Sin cortes de supervisión</h3>
              <p>El gestor puede pulsar en "Actualizar fuentes y analizar" para generar el primer corte de supervisión.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Línea Base de Planificación */}
      {activeTab === 'baseline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="proposal-editor-card">
            <header className="editor-card-header">
              <div className="editor-header-title">
                <div className="editor-icon-badge">
                  <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
                </div>
                <div>
                  <h3>Línea Base Oficial de Planificación</h3>
                  <p>Punto de referencia inmutable para calcular desviaciones y retrasos en el proyecto.</p>
                </div>
              </div>
            </header>

            <div className="editor-card-body">
              {/* Active Baseline Status */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: baseline?.baseline ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${baseline?.baseline ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`proposal-status-badge ${baseline?.baseline ? 'executed' : 'rejected'}`}>
                    <Icon path={baseline?.baseline ? 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' : 'M18 6L6 18 M6 6l12 12'} />
                    <span>{baseline?.baseline ? `Versión Oficial v${baseline.baseline.version}` : 'Sin línea base activa'}</span>
                  </span>
                  {baseline?.baseline && (
                    <span className="muted" style={{ fontSize: '12px' }}>
                      Confirmada el {dates(baseline.baseline.confirmedAt)}
                    </span>
                  )}
                </div>

                <p style={{ margin: '10px 0 0', fontSize: '13px' }}>
                  {baseline?.baseline
                    ? `Línea base confirmada por el gestor ${baseline.baseline.confirmedBy.displayName}. Sirve como referencia contra las lecturas de Trello.`
                    : 'Aún no se ha confirmado una línea base en el agente. Las desviaciones no se calcularán hasta que el gestor valide una lectura.'}
                </p>
              </div>

              {/* Candidate Snapshot */}
              {baseline?.candidate ? (
                <div style={{ marginTop: '14px', padding: '16px', borderRadius: '10px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700 }}>
                    Lectura Candidata Disponible
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    Observada el <strong>{dates(baseline.candidate.observedAt)}</strong> vía{' '}
                    <strong>{baseline.candidate.source === 'export' ? 'Exportación histórica' : 'Trello en vivo'}</strong> ·{' '}
                    <strong>{baseline.candidate.activities}</strong> actividades y{' '}
                    <strong>{baseline.candidate.milestones}</strong> hitos identificados.
                  </p>

                  {project.canManageProject && (
                    <div style={{ marginTop: '16px' }}>
                      <label className="editor-consent-box">
                        <input
                          type="checkbox"
                          checked={confirmation}
                          disabled={busy || active}
                          onChange={e => setConfirmation(e.target.checked)}
                        />
                        <span>
                          <strong>He revisado esta lectura de Trello</strong> y confirmo fijarla como la nueva versión
                          oficial de línea base del agente. Las versiones anteriores se preservan con trazabilidad inmutable.
                        </span>
                      </label>

                      <div className="editor-actions-row">
                        <button
                          type="button"
                          className="editor-submit-btn"
                          disabled={
                            busy ||
                            active ||
                            !confirmation ||
                            baseline.baseline?.snapshotId === baseline.candidate.snapshotId
                          }
                          onClick={() => void confirmBaseline()}
                        >
                          <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                          <span>Confirmar nueva versión de línea base</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted" style={{ margin: '10px 0 0', fontSize: '13px' }}>
                  No hay lecturas candidatas disponibles. Sincroniza Trello primero para obtener una lectura reciente.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Trabajos y Automatización */}
      {activeTab === 'automation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Automation Configuration Link Banner */}
          <div className="proposals-filter-panel" style={{ padding: '16px 20px' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>Configuración de Lecturas Periódicas</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
                Próxima lectura Trello: <strong>{dates(operations?.cursor?.next_sync)}</strong> · Próxima revisión
                código: <strong>{dates(operations?.cursor?.next_code)}</strong>
              </p>
            </div>
            <a href="#settings" className="proposals-refresh-btn" style={{ textDecoration: 'none' }}>
              <span>Configurar horarios en Ajustes →</span>
            </a>
          </div>

          {/* Jobs List Card */}
          <div className="proposals-list-container">
            <div className="proposals-list-header">
              <span className="proposals-list-count">
                Historial de trabajos recientes de supervisión (<strong>{data?.jobs.length ?? 0}</strong>)
              </span>
            </div>

            {!data?.jobs.length ? (
              <div className="proposals-empty-state">
                <p>Todavía no se han ejecutado trabajos de sincronización.</p>
              </div>
            ) : (
              <div className="proposals-cards-list">
                {data.jobs.map(job => {
                  const conf = statusNames[job.status] ?? { label: job.status, badgeClass: 'draft' };
                  return (
                    <article key={job.id} className="proposal-item-card">
                      <div className="proposal-card-left">
                        <div className={`proposal-status-bubble ${conf.badgeClass}`}>
                          <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
                        </div>
                        <div className="proposal-content-area">
                          <div className="proposal-meta-top">
                            <span className={`proposal-status-badge ${conf.badgeClass}`}>{conf.label}</span>
                            <span className="proposal-version-chip">Intento {job.attempt}</span>
                            <span className="proposal-card-date">{dates(job.createdAt)}</span>
                          </div>
                          <h4 className="proposal-card-title">
                            {kindNames[job.kind]?.title ?? job.kind}
                          </h4>
                          {job.errorCode && (
                            <p style={{ color: '#dc2626', margin: '4px 0 0', fontSize: '12px' }}>
                              Fallo: {explain(job.errorCode)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="proposal-action-arrow">
                        <button
                          type="button"
                          className="proposal-detail-trigger-btn"
                          disabled={detailBusy}
                          onClick={() => void openDetail('jobs', job.id)}
                        >
                          <span>Ver etapas</span>
                          <Icon path="M9 5l7 7-7 7" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Historial de Eventos del Proyecto */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* History Search & Outcome Filter Bar */}
          <section className="proposals-filter-panel">
            <div className="proposals-filter-tabs">
              <button
                type="button"
                className={'filter-pill-btn' + (historyOutcomeFilter === 'all' ? ' is-active' : '')}
                onClick={() => {
                  setHistoryOutcomeFilter('all');
                  setHistoryPage(1);
                }}
              >
                <span>Todos</span>
                <span className="pill-badge">{events?.length ?? 0}</span>
              </button>
              <button
                type="button"
                className={'filter-pill-btn' + (historyOutcomeFilter === 'succeeded' ? ' is-active' : '')}
                onClick={() => {
                  setHistoryOutcomeFilter('succeeded');
                  setHistoryPage(1);
                }}
              >
                <span>Completadas</span>
                <span className="pill-badge">
                  {events?.filter(e => e.outcome === 'succeeded').length ?? 0}
                </span>
              </button>
              <button
                type="button"
                className={'filter-pill-btn' + (historyOutcomeFilter === 'approved' ? ' is-active' : '')}
                onClick={() => {
                  setHistoryOutcomeFilter('approved');
                  setHistoryPage(1);
                }}
              >
                <span>Aprobadas</span>
                <span className="pill-badge">
                  {events?.filter(e => e.outcome === 'approved').length ?? 0}
                </span>
              </button>
              <button
                type="button"
                className={'filter-pill-btn' + (historyOutcomeFilter === 'failed' ? ' is-active' : '')}
                onClick={() => {
                  setHistoryOutcomeFilter('failed');
                  setHistoryPage(1);
                }}
              >
                <span>Fallidas</span>
                <span className="pill-badge">
                  {events?.filter(e => e.outcome === 'failed').length ?? 0}
                </span>
              </button>
            </div>

            <div className="proposals-secondary-controls">
              <div className="proposals-search-box">
                <Icon path="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
                <input
                  type="search"
                  placeholder="Buscar referencia, actor o proceso…"
                  value={historySearch}
                  onChange={e => {
                    setHistorySearch(e.target.value);
                    setHistoryPage(1);
                  }}
                  aria-label="Buscar en historial"
                />
                {historySearch && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryPage(1);
                    }}
                  >
                    <Icon path="M18 6L6 18 M6 6l12 12" />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* History Events Table */}
          <section className="proposals-list-container">
            <div className="proposals-list-header">
              <span className="proposals-list-count">
                Mostrando <strong>{filteredEvents.length}</strong> eventos de auditoría (últimos 200)
              </span>
            </div>

            {!events ? (
              <div className="proposals-empty-state">
                <p>Cargando auditoría…</p>
              </div>
            ) : !filteredEvents.length ? (
              <div className="proposals-empty-state">
                <p>No se encontraron eventos con los filtros seleccionados.</p>
              </div>
            ) : (
              <div className="code-analyses-table-wrap" style={{ margin: 0, border: 'none' }}>
                <table className="code-analyses-table">
                  <thead>
                    <tr>
                      <th>Fecha / Actor</th>
                      <th>Proceso</th>
                      <th>Resultado</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvents.map(event => (
                      <tr key={event.id}>
                        <td>
                          <strong>{dates(event.created_at)}</strong>
                          <small className="muted block-sub">{event.actor ?? 'Sistema'}</small>
                        </td>
                        <td>
                          <strong>{resources[event.resource_type] ?? 'Operación'}</strong>
                          <details style={{ fontSize: '12px', marginTop: '4px' }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                              Ver acción
                            </summary>
                            <code style={{ fontSize: '11px', display: 'block', marginTop: '2px' }}>
                              {event.action}
                            </code>
                          </details>
                        </td>
                        <td>
                          <span
                            className={`proposal-status-badge ${
                              ['succeeded', 'approved', 'simulated'].includes(event.outcome)
                                ? 'executed'
                                : event.outcome === 'failed'
                                  ? 'rejected'
                                  : 'draft'
                            }`}
                          >
                            {outcomes[event.outcome] ?? event.outcome}
                          </span>
                        </td>
                        <td>
                          <code className="content-hash" style={{ fontSize: '11px' }}>
                            {event.resource_id.slice(0, 16)}…
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Centered Pagination for History */}
            {filteredEvents.length > 0 && (
              <Pagination
                page={safeHistoryPage}
                totalPages={totalHistoryPages}
                totalItems={filteredEvents.length}
                pageSize={historyPageSize}
                pageSizeOptions={[10, 20, 50]}
                sizeSelectId="history-page-size"
                sizeSelectLabel="Cantidad de eventos por página"
                onPageChange={setHistoryPage}
                onPageSizeChange={size => { setHistoryPageSize(size); setHistoryPage(1); }}
              />
            )}
          </section>
        </div>
      )}

      {/* Slide-over Drawer for Job Details */}
      {jobDetail && (
        <div className="proposals-drawer-backdrop" onClick={() => setJobDetail(null)} role="dialog" aria-modal="true">
          <aside className="proposals-detail-drawer" onClick={e => e.stopPropagation()}>
            <header className="drawer-header">
              <div className="drawer-header-meta">
                <span className="proposal-status-badge authorized">Trabajo de supervisión</span>
                <span className="proposal-version-chip">ID: {jobDetail.id.slice(0, 8)}</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setJobDetail(null)}
                title="Cerrar (Esc)"
              >
                <Icon path="M18 6L6 18 M6 6l12 12" />
              </button>
            </header>

            <div className="drawer-scroll-body">
              <div className="drawer-title-area">
                <h3>Etapas del Trabajo de Supervisión</h3>
                <p className="drawer-submessage">Secuencia de ejecución interna y validaciones registradas.</p>
              </div>

              <div className="drawer-content-flow">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {jobDetail.events.map((event, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: 'var(--color-bg-base)',
                      border: '1px solid var(--color-border)',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{stages[event.stage] ?? event.stage}</strong>
                      <span
                        className={`proposal-status-badge ${
                          event.outcome === 'succeeded' ? 'executed' : event.outcome === 'failed' ? 'rejected' : 'draft'
                        }`}
                      >
                        {outcomes[event.outcome] ?? event.outcome}
                      </span>
                    </div>
                    <small className="muted" style={{ display: 'block', marginTop: '4px' }}>
                      {dates(event.createdAt)}
                    </small>
                    {event.errorCode && (
                      <p style={{ color: '#dc2626', margin: '4px 0 0', fontSize: '12px' }}>
                        Error: {explain(event.errorCode)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
        </div>
      )}
    </div>
  );
}

