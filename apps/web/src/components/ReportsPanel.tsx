import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectAccess, ReportDetail, ReportsOverview, ReportSummary } from '@dev-project-agent/contracts';
import { Icon } from './Workspace';

interface StatusConfigItem {
  label: string;
  badgeClass: string;
  icon: string;
}

const statusConfigs: Record<string, StatusConfigItem> = {
  published: {
    label: 'Publicado',
    badgeClass: 'executed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  draft: {
    label: 'Borrador',
    badgeClass: 'draft',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  queued: {
    label: 'En cola',
    badgeClass: 'in-review',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  failed: {
    label: 'No generado',
    badgeClass: 'rejected',
    icon: 'M18 6L6 18 M6 6l12 12',
  },
};

function getStatusConfig(status: string): StatusConfigItem {
  return (
    statusConfigs[status] ?? {
      label: status,
      badgeClass: 'draft',
      icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
    }
  );
}

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const dates = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sin fecha';

function getPaginationRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', total];
  }
  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

export function ReportsPanel({
  project,
  csrfToken,
  configurationOnly = false,
}: {
  project: ProjectAccess;
  csrfToken: string;
  configurationOnly?: boolean;
}) {
  const prefix = `/api/v1/projects/${project.id}/reports`;

  const [data, setData] = useState<ReportsOverview | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Schedule configuration
  const [enabled, setEnabled] = useState(false);
  const [weekday, setWeekday] = useState(5);
  const [time, setTime] = useState('18:00');

  const savedTime = data
    ? String(data.schedule.hour).padStart(2, '0') + ':' + String(data.schedule.minute).padStart(2, '0')
    : '';
  const dirty =
    !!data && (enabled !== data.schedule.enabled || weekday !== data.schedule.weekday || time !== savedTime);
  useUnsavedChanges(dirty, 'Reportes');

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const requestKey = useRef<{ revisionOf: string | null; key: string } | null>(null);
  const settingsVersion = useRef<number | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(prefix, signal ? { signal } : {});
      if (!response.ok) throw new Error();
      const next = (await response.json()) as ReportsOverview;
      if (signal?.aborted) return;

      let report: ReportDetail | null = null;
      if (selected) {
        const result = await fetch(prefix + '/' + selected, signal ? { signal } : {});
        if (!result.ok) throw new Error();
        report = (await result.json()) as ReportDetail;
      }
      if (signal?.aborted) return;

      if (report) setDetail(report);
      setData(next);

      if (settingsVersion.current !== next.schedule.version) {
        settingsVersion.current = next.schedule.version;
        setEnabled(next.schedule.enabled);
        setWeekday(next.schedule.weekday);
        setTime(
          `${String(next.schedule.hour).padStart(2, '0')}:${String(next.schedule.minute).padStart(2, '0')}`
        );
      }
    },
    [prefix, selected]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setError('No se pudieron consultar los reportes. Vuelve a actualizar.');
      }
    });
    return () => controller.abort();
  }, [load]);

  const queued = data?.reports.some(report => report.status === 'queued') ?? false;

  useEffect(() => {
    if (!queued) return;
    const controller = new AbortController();
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void load(controller.signal)
        .catch(() => {
          if (!controller.signal.aborted) setError('No se pudo actualizar el reporte.');
        })
        .finally(() => {
          pending = false;
        });
    }, 2500);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [queued, load]);

  // Close drawer on ESC
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected) {
        setSelected(null);
        setDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected]);

  async function generate(revisionOf: string | null = null) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    if (requestKey.current?.revisionOf !== revisionOf) {
      requestKey.current = { revisionOf, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch(prefix, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          requestKey: requestKey.current!.key,
          ...(revisionOf ? { revisionOf } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message ?? 'No se pudo solicitar el reporte.');
        return;
      }
      requestKey.current = null;
      setSelected(body.id);
      setDetail(null);
      setNotice('Reporte solicitado. Se prepara y revisa con las evidencias guardadas.');
      await load();
    } catch {
      setError('No se pudo confirmar la solicitud. Actualiza antes de volver a intentar.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!data || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const [hour, minute] = time.split(':').map(Number);
      const response = await fetch(prefix + '/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          expectedVersion: data.schedule.version,
          enabled,
          weekday,
          hour,
          minute,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message ?? 'No se pudo guardar la programación.');
        return;
      }
      setNotice('Programación guardada. El servicio recuperará los cortes pendientes cuando esté encendido.');
      await load();
    } catch {
      setError('No se pudo confirmar la programación. Actualiza el panel.');
    } finally {
      setBusy(false);
    }
  }

  // Filtered reports
  const allReports = data?.reports ?? [];
  const totalReportsCount = allReports.length;
  const publishedCount = allReports.filter(r => r.status === 'published').length;
  const draftCount = allReports.filter(r => r.status === 'draft').length;
  const queuedCount = allReports.filter(r => r.status === 'queued').length;
  const failedCount = allReports.filter(r => r.status === 'failed').length;

  const visibleReports = allReports.filter(report => {
    if (statusFilter !== 'all' && report.status !== statusFilter) return false;
    if (fromDate && new Date(report.cutoff) < new Date(fromDate + 'T00:00:00-05:00')) return false;
    if (toDate && new Date(report.cutoff) > new Date(toDate + 'T23:59:59.999-05:00')) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(visibleReports.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedReports = visibleReports.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageRange = getPaginationRange(safePage, totalPages);

  // If inside Settings (configurationOnly), render just the schedule editor card
  if (configurationOnly) {
    return (
      <div className="proposal-editor-card report-settings-card">
        <header className="editor-card-header">
          <div className="editor-header-title">
            <div className="editor-icon-badge">
              <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
            </div>
            <div>
              <h3>Programación Semanal de Reportes</h3>
              <p>Generación automática de cortes periódicos los viernes a las 18:00 (Ecuador).</p>
            </div>
          </div>
        </header>

        <div className="editor-card-body">
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

          <label className="editor-consent-box">
            <input
              type="checkbox"
              checked={enabled}
              onChange={event => setEnabled(event.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>Activar generación semanal automática en este equipo</strong>
            </span>
          </label>

          <div className="editor-grid">
            <div className="editor-field">
              <label htmlFor="report-weekday">Día del reporte</label>
              <select
                id="report-weekday"
                className="editor-select"
                value={weekday}
                onChange={event => setWeekday(Number(event.target.value))}
                disabled={busy}
              >
                {weekdays.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="editor-field">
              <label htmlFor="report-time">Hora del reporte (horario de Ecuador)</label>
              <input
                id="report-time"
                className="editor-input"
                type="time"
                required
                value={time}
                onChange={event => setTime(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <p className="editor-hint">
            Valor acordado: <strong>viernes 18:00 (America/Guayaquil)</strong>. El equipo y el servicio deben estar
            encendidos para ejecutar el corte. Tras un reinicio se recuperan los cortes originales pendientes.
          </p>

          <div className="editor-actions-row">
            <span className="muted" role="status" style={{ fontSize: '12px' }}>
              {dirty ? 'Hay cambios sin guardar' : 'Programación guardada'}
            </span>
            <button
              type="button"
              className="editor-submit-btn"
              onClick={() => void save()}
              disabled={busy || !time || !dirty}
            >
              <span>Guardar programación</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Reports Dashboard
  return (
    <div className="proposals-dashboard reports-dashboard">
      {/* Top Banner / Hero Context matching proposals-hero-banner */}
      <section className="proposals-hero-banner">
        <div className="proposals-hero-main">
          <div className="proposals-live-badge">
            <span className="live-pulse-dot" />
            <span>GENERACIÓN DETERMINISTA · SIN CONSUMO DE IA</span>
          </div>
          <h2 className="proposals-hero-title">Reportes Semanales y Cortes de Seguimiento</h2>
          <p className="proposals-hero-subtitle">
            Avance, desviaciones, riesgos, calidad de código y decisiones en versiones guardadas con trazabilidad
            inmutable. Preparación, validación y publicación mediante reglas deterministas de calidad.
          </p>
        </div>

        <div className="proposals-hero-actions">
          <button
            type="button"
            className="proposals-refresh-btn"
            disabled={busy}
            onClick={() => {
              setError('');
              void load().catch(() => setError('No se pudieron actualizar los reportes.'));
            }}
            title="Actualizar listado de reportes"
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
              disabled={busy || queued}
              onClick={() => void generate()}
              title="Generar un nuevo corte de seguimiento con las evidencias actuales"
            >
              {queued ? (
                <>
                  <span className="spin-icon">
                    <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
                  </span>
                  <span>Preparando reporte…</span>
                </>
              ) : (
                <>
                  <Icon path="M12 5v14 M5 12h14" />
                  <span>Generar reporte ahora</span>
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

      {data?.schedule.errorCode && (
        <div role="alert" className="proposals-error-banner">
          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <span>
            Programación suspendida porque cambió la autoridad del gestor que la activó. Un gestor vigente debe
            guardar nuevamente la configuración en Ajustes.
          </span>
        </div>
      )}

      {/* KPI Cards Row matching proposals-kpi-grid */}
      <section className="proposals-kpi-grid" aria-label="Métricas de reportes">
        <div className="proposals-kpi-card">
          <div className="kpi-icon-box total">
            <Icon path="M9 12h6 M9 16h6 M9 8h6 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Total Reportes</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{totalReportsCount}</strong>
              <span className="kpi-subtext">cortes generados</span>
            </div>
          </div>
        </div>

        <div className={'proposals-kpi-card' + (data?.schedule.enabled ? '' : ' has-danger')}>
          <div className={'kpi-icon-box ' + (data?.schedule.enabled ? 'success' : 'danger')}>
            <Icon
              path={
                data?.schedule.enabled
                  ? 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'
                  : 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z'
              }
            />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Programación Semanal</span>
            <div className="kpi-value-row">
              <strong className="kpi-number" style={{ fontSize: '16px' }}>
                {data?.schedule.enabled
                  ? `${weekdays[data.schedule.weekday]} ${savedTime}`
                  : 'Sin activar'}
              </strong>
              <span className="kpi-subtext">
                {data?.schedule.enabled ? 'Generación automática activa' : 'Solo cortes manuales'}
              </span>
            </div>
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box progress">
            <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Último Corte</span>
            <div className="kpi-value-row">
              <strong className="kpi-number" style={{ fontSize: '14px' }}>
                {allReports[0]?.cutoff ? dates(allReports[0].cutoff) : 'Ninguno'}
              </strong>
              <span className="kpi-subtext">
                {allReports[0] ? `Versión v${allReports[0].version}` : 'Sin cortes previos'}
              </span>
            </div>
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box success">
            <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Próximo Corte</span>
            <div className="kpi-value-row">
              <strong className="kpi-number" style={{ fontSize: '14px' }}>
                {data?.schedule.nextCutoff ? dates(data.schedule.nextCutoff) : 'No programado'}
              </strong>
              <span className="kpi-subtext">Horario de Ecuador</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Panel matching proposals-filter-panel */}
      <section className="proposals-filter-panel">
        <div className="proposals-filter-tabs">
          <button
            type="button"
            className={'filter-pill-btn' + (statusFilter === 'all' ? ' is-active' : '')}
            onClick={() => {
              setStatusFilter('all');
              setCurrentPage(1);
            }}
          >
            <span>Todos</span>
            <span className="pill-badge">{totalReportsCount}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (statusFilter === 'published' ? ' is-active' : '')}
            onClick={() => {
              setStatusFilter('published');
              setCurrentPage(1);
            }}
          >
            <span>Publicados</span>
            <span className="pill-badge">{publishedCount}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (statusFilter === 'draft' ? ' is-active' : '')}
            onClick={() => {
              setStatusFilter('draft');
              setCurrentPage(1);
            }}
          >
            <span>Borradores</span>
            <span className="pill-badge">{draftCount}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (statusFilter === 'queued' ? ' is-active' : '')}
            onClick={() => {
              setStatusFilter('queued');
              setCurrentPage(1);
            }}
          >
            <span>En cola</span>
            <span className="pill-badge">{queuedCount}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (statusFilter === 'failed' ? ' is-active' : '')}
            onClick={() => {
              setStatusFilter('failed');
              setCurrentPage(1);
            }}
          >
            <span>Fallidos</span>
            <span className="pill-badge">{failedCount}</span>
          </button>
        </div>

        <div className="proposals-secondary-controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <label htmlFor="report-from-date" className="sr-only">
              Desde
            </label>
            <input
              id="report-from-date"
              type="date"
              value={fromDate}
              onChange={event => {
                setFromDate(event.target.value);
                setCurrentPage(1);
              }}
              className="editor-input"
              style={{ height: '38px', padding: '6px 10px', fontSize: '12px' }}
              title="Filtrar corte desde esta fecha"
            />
            <span className="muted">a</span>
            <label htmlFor="report-to-date" className="sr-only">
              Hasta
            </label>
            <input
              id="report-to-date"
              type="date"
              min={fromDate}
              value={toDate}
              onChange={event => {
                setToDate(event.target.value);
                setCurrentPage(1);
              }}
              className="editor-input"
              style={{ height: '38px', padding: '6px 10px', fontSize: '12px' }}
              title="Filtrar corte hasta esta fecha"
            />

            {(fromDate || toDate || statusFilter !== 'all') && (
              <button
                type="button"
                className="editor-cancel-btn"
                style={{ padding: '6px 12px', fontSize: '12px', height: '38px' }}
                onClick={() => {
                  setStatusFilter('all');
                  setFromDate('');
                  setToDate('');
                  setCurrentPage(1);
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Reports List Container matching proposals-list-container */}
      <section className="proposals-list-container">
        <div className="proposals-list-header">
          <span className="proposals-list-count">
            Mostrando <strong>{visibleReports.length}</strong>{' '}
            {visibleReports.length === 1 ? 'reporte' : 'reportes'}
            {visibleReports.length !== totalReportsCount ? ` (filtrados de ${totalReportsCount})` : ''}
          </span>
        </div>

        {!data ? (
          <div className="proposals-empty-state">
            <div className="empty-icon-shield">
              <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </div>
            <h3>Consultando reportes…</h3>
            <p>Cargando información del historial y de la programación semanal.</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="proposals-empty-state">
            <div className="empty-icon-shield">
              <Icon path="M9 12h6 M9 16h6 M9 8h6 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
            </div>
            <h3>No se encontraron reportes</h3>
            <p>
              {totalReportsCount === 0
                ? 'Aún no hay reportes generados en este proyecto. Puedes pulsar en "+ Generar reporte ahora" para crear el primero.'
                : 'No hay reportes que coincidan con los filtros aplicados actualmente.'}
            </p>
            {totalReportsCount > 0 && (
              <button
                type="button"
                className="proposals-reset-filters-btn"
                onClick={() => {
                  setStatusFilter('all');
                  setFromDate('');
                  setToDate('');
                  setCurrentPage(1);
                }}
              >
                Restablecer filtros
              </button>
            )}
          </div>
        ) : (
          <div className="proposals-cards-list">
            {paginatedReports.map(report => {
              const conf = getStatusConfig(report.status);
              const isSelected = selected === report.id;
              return (
                <article
                  key={report.id}
                  className={'proposal-item-card' + (isSelected ? ' is-selected' : '')}
                  onClick={() => {
                    setSelected(report.id);
                    setDetail(null);
                  }}
                >
                  <div className="proposal-card-left">
                    <div className={'proposal-status-bubble ' + conf.badgeClass}>
                      <Icon path={conf.icon} />
                    </div>

                    <div className="proposal-content-area">
                      <div className="proposal-meta-top">
                        <span className={'proposal-status-badge ' + conf.badgeClass}>
                          <Icon path={conf.icon} />
                          <span>{conf.label}</span>
                        </span>
                        <span className="proposal-version-chip">v{report.version}</span>
                        <span
                          className={
                            'proposal-purpose-chip ' +
                            (report.kind === 'scheduled' ? 'live' : 'demonstration')
                          }
                        >
                          {report.kind === 'scheduled' ? 'Programado' : 'Manual'}
                        </span>
                      </div>

                      <h4 className="proposal-card-title">Corte semanal del {dates(report.cutoff)}</h4>
                      <p className="proposal-card-goal">
                        Periodo de seguimiento: <strong>{dates(report.periodStart)}</strong> hasta{' '}
                        <strong>{dates(report.cutoff)}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="proposal-action-arrow">
                    <button
                      type="button"
                      className="proposal-detail-trigger-btn"
                      onClick={e => {
                        e.stopPropagation();
                        setSelected(report.id);
                        setDetail(null);
                      }}
                      aria-expanded={isSelected}
                      title="Ver detalle del reporte, auditorías y vista previa imprimible"
                    >
                      <span>Examinar</span>
                      <Icon path="M9 5l7 7-7 7" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Centered Pagination matching planning-pagination-bar */}
        {visibleReports.length > 0 && (
          <footer className="planning-pagination-bar">
            <div className="pagination-summary">
              <span>
                {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, visibleReports.length)} de{' '}
                <strong>{visibleReports.length}</strong>
              </span>
            </div>

            <nav className="pagination-pages-nav" aria-label="Páginas">
              <button
                type="button"
                className="pagination-arrow-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                aria-label="Página anterior"
                title="Página anterior"
              >
                <Icon path="M15 19l-7-7 7-7" />
              </button>

              {pageRange.map((p, idx) =>
                p === 'ellipsis' ? (
                  <span key={`el-${idx}`} className="pagination-ellipsis" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={'pagination-number-btn' + (p === safePage ? ' is-active' : '')}
                    onClick={() => setCurrentPage(p)}
                    aria-current={p === safePage ? 'page' : undefined}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                className="pagination-arrow-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                aria-label="Página siguiente"
                title="Página siguiente"
              >
                <Icon path="M9 5l7 7-7 7" />
              </button>
            </nav>

            <div className="pagination-size-container">
              <select
                id="reports-page-size"
                className="pagination-pagesize-select"
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                aria-label="Cantidad de reportes por página"
              >
                <option value={5}>5 / pág</option>
                <option value={10}>10 / pág</option>
                <option value={20}>20 / pág</option>
              </select>
            </div>
          </footer>
        )}
      </section>

      {/* Slide-over Inspection Drawer for Reports matching proposals-detail-drawer */}
      {selected && (
        <div
          className="proposals-drawer-backdrop"
          onClick={() => {
            setSelected(null);
            setDetail(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-drawer-title"
        >
          <aside
            className="proposals-detail-drawer"
            onClick={e => e.stopPropagation()}
          >
            <header className="drawer-header">
              <div className="drawer-header-meta">
                {detail && (
                  <>
                    <span className={'proposal-status-badge ' + getStatusConfig(detail.status).badgeClass}>
                      <Icon path={getStatusConfig(detail.status).icon} />
                      <span>{getStatusConfig(detail.status).label}</span>
                    </span>
                    <span className="proposal-version-chip">v{detail.version}</span>
                    <span
                      className={
                        'proposal-purpose-chip ' +
                        (detail.kind === 'scheduled' ? 'live' : 'demonstration')
                      }
                    >
                      {detail.kind === 'scheduled' ? 'Programado' : 'Manual'}
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
                aria-label="Cerrar detalle"
                title="Cerrar (Esc)"
              >
                <Icon path="M18 6L6 18 M6 6l12 12" />
              </button>
            </header>

            <div className="drawer-scroll-body">
              <div className="drawer-title-area">
                <h3 id="report-drawer-title">
                  {detail ? `Reporte Semanal · Versión ${detail.version}` : 'Cargando reporte…'}
                </h3>
                {detail && (
                  <p className="drawer-submessage">
                    Periodo: <strong>{dates(detail.periodStart)}</strong> hasta{' '}
                    <strong>{dates(detail.cutoff)}</strong> · Generado:{' '}
                    <code>{dates(detail.createdAt)}</code>
                  </p>
                )}
              </div>

              {!detail ? (
                <div className="proposals-empty-state">
                  <span className="spin-icon">
                    <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </span>
                  <p>Cargando información completa del reporte…</p>
                </div>
              ) : (
                <div className="drawer-content-flow">
                  {detail.errorCode && (
                    <div role="alert" className="proposals-error-banner" style={{ margin: '14px 0' }}>
                      <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <span>
                        {detail.errorCode === 'FORBIDDEN'
                          ? 'La autoridad del gestor cambió; la generación se detuvo.'
                          : 'La generación falló. Puedes solicitar otra versión y conservar este registro.'}
                      </span>
                    </div>
                  )}

                  {detail.data && (
                    <>
                      {/* Notice Flags */}
                      {(detail.data.late || detail.data.partialPeriod || detail.data.sources.some(s => s.timing === 'after_cutoff')) && (
                        <div className="editor-warning-box" style={{ margin: '12px 0' }}>
                          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <div>
                            {detail.data.late && <span>Generado con retraso respecto al corte original. </span>}
                            {detail.data.partialPeriod && <span>Periodo parcial observado. </span>}
                            {detail.data.sources.some(s => s.timing === 'after_cutoff') && (
                              <span>Incluye evidencia posterior al corte; no reconstruye el estado histórico.</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Executive Summary Card */}
                      <div className="drawer-section-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Resumen Ejecutivo</h4>
                          <span className="proposal-status-badge authorized">Reglas deterministas</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-base)' }}>
                          {detail.data.executiveSummary}
                        </p>
                      </div>

                      {/* Primary Actions Row */}
                      <div style={{ display: 'flex', gap: '12px', margin: '16px 0', flexWrap: 'wrap' }}>
                        <a
                          href={prefix + '/' + detail.id + '/print'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="editor-submit-btn"
                          style={{ textDecoration: 'none', display: 'inline-flex' }}
                        >
                          <Icon path="M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z" />
                          <span>Abrir versión imprimible / Guardar PDF</span>
                        </a>

                        {project.canManageProject && detail.status !== 'queued' && (
                          <button
                            type="button"
                            className="editor-cancel-btn"
                            disabled={busy || queued}
                            onClick={() => void generate(detail.id)}
                          >
                            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            <span>Preparar nueva versión del mismo periodo</span>
                          </button>
                        )}
                      </div>

                      {/* Verification Stages */}
                      <div className="drawer-section-card" style={{ marginTop: '16px' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700 }}>
                          Etapas de Revisión Determinista
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                          {detail.data.stages.map(st => (
                            <div
                              key={st.stage}
                              style={{
                                padding: '12px',
                                borderRadius: '8px',
                                background: 'var(--color-bg-base)',
                                border: '1px solid var(--color-border)',
                                fontSize: '12px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <strong style={{ textTransform: 'capitalize' }}>
                                  {st.stage === 'executor' ? 'Ejecutor' : st.stage === 'reviewer' ? 'Revisor' : 'Aprobador'}
                                </strong>
                                <span
                                  className={`proposal-status-badge ${
                                    st.outcome === 'pass' ? 'executed' : 'changes-requested'
                                  }`}
                                  style={{ fontSize: '10px', padding: '1px 6px' }}
                                >
                                  {st.outcome === 'pass' ? 'Superado' : 'Requiere evidencia'}
                                </span>
                              </div>
                              <p className="muted" style={{ margin: 0, fontSize: '11px' }}>
                                Reglas deterministas de validación
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Limitations and Sources */}
                      <div className="drawer-section-card" style={{ marginTop: '16px' }}>
                        <details>
                          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                            Ver limitaciones ({detail.data.limitations.length}) y sello criptográfico
                          </summary>
                          <div style={{ marginTop: '12px' }}>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                              {detail.data.limitations.map((val, idx) => (
                                <li key={idx}>{val}</li>
                              ))}
                            </ul>
                            <div className="drawer-meta-box" style={{ marginTop: '14px' }}>
                              <span className="meta-label">Huella criptográfica de contenido:</span>
                              <code className="meta-value" style={{ wordBreak: 'break-all' }}>
                                {detail.contentHash ?? 'Sin huella'}
                              </code>
                            </div>
                          </div>
                        </details>
                      </div>

                      {/* Embedded Report Preview */}
                      <div className="drawer-section-card" style={{ marginTop: '16px' }}>
                        <details open>
                          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>
                            Vista previa integrada del reporte
                          </summary>
                          <iframe
                            title="Vista previa del reporte semanal"
                            src={prefix + '/' + detail.id + '/print'}
                            sandbox="allow-same-origin"
                            className="report-preview"
                            style={{ height: '600px', borderRadius: '8px', border: '1px solid var(--color-border)', width: '100%' }}
                          />
                        </details>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
