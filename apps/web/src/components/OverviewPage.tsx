import { useEffect, useState, type KeyboardEvent } from 'react';
import type { GitHubOverview, ProjectAccess, ProposalOverview, ReportsOverview, TrackingResponse } from '@dev-project-agent/contracts';
import { navigate, Icon, pages } from './Workspace';

const activateCard = (event: KeyboardEvent<HTMLElement>, page: Parameters<typeof navigate>[0]) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    navigate(page);
  }
};

export const localDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : 'Sin lectura';

export function OverviewPage({ project }: { project: ProjectAccess }) {
  const [data, setData] = useState<{
    tracking: TrackingResponse;
    github: GitHubOverview;
    proposals: ProposalOverview;
    reports: ReportsOverview;
  } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const base = '/api/v1/projects/' + project.id;
        const [tracking, github, proposals, reports] = await Promise.all(
          ['tracking', 'github', 'proposals', 'reports'].map(async path => {
            const response = await fetch(base + '/' + path, { signal: controller.signal });
            if (!response.ok) throw new Error();
            return response.json();
          })
        );
        if (!controller.signal.aborted) {
          setData({ tracking, github, proposals, reports });
          setError('');
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('No se pudo cargar el resumen. Tus datos guardados se conservan.');
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [project.id, attempt]);

  if (!data) {
    return (
      <section className="overview-loading-state">
        <div className="empty-icon-wrapper">
          <Icon path={pages.overview.icon} />
        </div>
        <h2>{error ? 'Resumen no disponible' : 'Preparando tu resumen'}</h2>
        <p className="muted">{error || 'Consultando las últimas evidencias guardadas…'}</p>
        {error && (
          <button type="button" className="retry-button" onClick={() => setAttempt(attempt + 1)}>
            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            <span>Reintentar</span>
          </button>
        )}
      </section>
    );
  }

  const summary = data.tracking.summary;
  const percent = summary?.progress.percent;
  const activities = summary?.activities;
  const pending = data.proposals.proposals.filter(item => item.state === 'pending_human_approval');
  const recent = data.reports.reports.find(item => item.status === 'published' || item.status === 'draft');
  const findings = data.tracking.findings ?? [];

  return (
    <div className="overview-dashboard">
      {error && (
        <div role="alert" className="overview-alert-banner">
          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <span>{error}</span>
        </div>
      )}

      {/* Executive overview */}
      <section className="overview-hero-card">
        <div className="hero-main-content">
          <div className="hero-status-tag">
            <span className="live-indicator-pulse" />
            <span>SUPERVISIÓN DEL PROYECTO</span>
          </div>
          <h1 className="hero-title">{project.name}</h1>
          <p className="hero-subtitle">
            Seguimiento de entregas, riesgos de cronograma y revisión de código con trazabilidad inmutable.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-primary-btn" onClick={() => navigate('planning')}>
              <span>Ver Planificación</span>
              <Icon path="M5 12h14 M12 5l7 7-7 7" />
            </button>
            <button type="button" className="hero-secondary-btn" onClick={() => navigate('alerts')}>
              <span>Revisar Alertas</span>
              {activities?.overdue ? <span className="alert-count-pill">{activities.overdue}</span> : null}
            </button>
          </div>
        </div>

        <div className="hero-progress-box">
          <div className="progress-header">
            <span className="progress-label">Avance declarado</span>
            <span className="progress-percentage">{percent == null ? '—' : `${percent.toLocaleString('es-EC')}%`}</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${percent ?? 0}%` }} />
          </div>
          <div className="progress-details">
            <span className="progress-stats">
              {summary ? `${summary.progress.numerator} de ${summary.progress.denominator} actividades con finalización declarada` : 'Sin datos suficientes'}
            </span>
            <small className="progress-note">Basado en declaraciones de Trello</small>
          </div>
        </div>
      </section>

      {/* Key metrics */}
      <div className="kpi-metric-grid">
        <section className="kpi-card" role="link" tabIndex={0} onKeyDown={event => activateCard(event, 'planning')} onClick={() => navigate('planning')}>
          <div className="kpi-header">
            <span className="kpi-icon-bubble info">
              <Icon path={pages.planning.icon} />
            </span>
            <span className="kpi-pill">En curso</span>
          </div>
          <strong className="kpi-value">{activities?.inProgress ?? '—'}</strong>
          <p className="kpi-label">Actividades activas</p>
          <small className="kpi-subtext">De {activities?.total ?? '—'} registradas en el plan</small>
        </section>

        <section className={`kpi-card ${activities?.overdue ? 'kpi-warning' : ''}`} role="link" tabIndex={0} onKeyDown={event => activateCard(event, 'alerts')} onClick={() => navigate('alerts')}>
          <div className="kpi-header">
            <span className={`kpi-icon-bubble ${activities?.overdue ? 'warning' : 'success'}`}>
              <Icon path={pages.alerts.icon} />
            </span>
            {activities?.overdue ? (
              <span className="kpi-pill alert">Urgente</span>
            ) : (
              <span className="kpi-pill success">Al día</span>
            )}
          </div>
          <strong className="kpi-value">{activities?.overdue ?? 0}</strong>
          <p className="kpi-label">Vencimientos superados</p>
          <small className="kpi-subtext">
            {activities?.dueSoon ? `${activities.dueSoon} próximas a vencer en 72h` : 'Sin retrasos inmediatos'}
          </small>
        </section>

        <section className={`kpi-card ${pending.length > 0 ? 'kpi-highlight' : ''}`} role="link" tabIndex={0} onKeyDown={event => activateCard(event, 'proposals')} onClick={() => navigate('proposals')}>
          <div className="kpi-header">
            <span className="kpi-icon-bubble accent">
              <Icon path={pages.proposals.icon} />
            </span>
            {pending.length > 0 ? (
              <span className="kpi-pill highlight">Requiere firma</span>
            ) : (
              <span className="kpi-pill">Sin pendientes</span>
            )}
          </div>
          <strong className="kpi-value">{pending.length}</strong>
          <p className="kpi-label">Decisiones pendientes</p>
          <small className="kpi-subtext">
            {pending.length > 0 ? 'Propuestas validadas por la tríada' : 'No hay propuestas en espera'}
          </small>
        </section>

        <section className="kpi-card" role="link" tabIndex={0} onKeyDown={event => activateCard(event, 'reports')} onClick={() => navigate('reports')}>
          <div className="kpi-header">
            <span className="kpi-icon-bubble purple">
              <Icon path={pages.reports.icon} />
            </span>
            <span className="kpi-pill">Semanal</span>
          </div>
          <strong className="kpi-value-small">
            {data.reports.schedule.enabled && data.reports.schedule.nextCutoff
              ? localDate(data.reports.schedule.nextCutoff).split(',')[0]
              : 'Sin activar'}
          </strong>
          <p className="kpi-label">Próximo corte oficial</p>
          <small className="kpi-subtext">
            {data.reports.schedule.enabled ? 'Viernes 18:00 (Ecuador)' : 'Configurar en Reportes'}
          </small>
        </section>
      </div>

      {/* Priority items and source status */}
      <div className="dashboard-columns-grid">
        {/* Priority items */}
        <section className="dashboard-card attention-card">
          <div className="card-header-flex">
            <div>
              <h3 className="card-heading-title">Atención Prioritaria</h3>
              <p className="card-heading-subtitle">Desviaciones y bloqueos que requieren acción</p>
            </div>
            <button type="button" className="card-header-action" onClick={() => navigate('alerts')}>
              <span>Ver todas</span>
              <Icon path="M9 5l7 7-7 7" />
            </button>
          </div>

          {findings.length > 0 ? (
            <div className="attention-items-list">
              {findings.slice(0, 5).map(item => (
                <article key={item.id} className="priority-item-row" role="link" tabIndex={0} onKeyDown={event => activateCard(event, 'alerts')} onClick={() => navigate('alerts')}>
                  <div className={`priority-severity-badge ${item.attention === 'immediate' ? 'severe' : 'moderate'}`}>
                    <Icon path={item.code === 'blocked' ? 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' : 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6l5.25 3.15.75-1.23-4.5-2.67z'} />
                  </div>
                  <div className="priority-item-info">
                    <strong className="priority-item-title">{item.itemName}</strong>
                    <span className="priority-item-desc">
                      {item.code === 'overdue'
                        ? 'Fecha límite superada sin completarse'
                        : item.code === 'due_soon'
                        ? 'Vencimiento próximo (menos de 72 horas)'
                        : item.code === 'blocked'
                        ? 'Bloqueo reportado en la tarjeta'
                        : item.message || 'Datos inconsistentes'}
                    </span>
                  </div>
                  <button type="button" className="priority-action-btn" aria-label={`Revisar ${item.itemName}`}>
                    <span>Revisar</span>
                    <Icon path="M9 5l7 7-7 7" />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-feed-state">
              <div className="empty-check-icon">
                <Icon path="M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" />
              </div>
              <h4>Sin alertas críticas</h4>
              <p>El proyecto no presenta bloqueos ni vencimientos superados en la última lectura.</p>
            </div>
          )}
        </section>

        {/* Integration and source status */}
        <section className="dashboard-card sources-card">
          <div className="card-header-flex">
            <div>
              <h3 className="card-heading-title">Fuentes & Conexiones</h3>
              <p className="card-heading-subtitle">Estado de sincronización de plataformas</p>
            </div>
            <button type="button" className="card-header-action" onClick={() => navigate('operations')}>
              <span>Gestionar</span>
              <Icon path="M9 5l7 7-7 7" />
            </button>
          </div>

          <div className="sources-list">
            {/* Trello Item */}
            <div className="source-item-box">
              <div className="source-brand-icon trello">
                <Icon path="M4 4h16v16H4V4zm3 3h4v8H7V7zm6 0h4v5h-4V7z" />
              </div>
              <div className="source-info">
                <strong>Trello · Planificación</strong>
                <p>Última lectura: {localDate(data.tracking.source?.observedAt)}</p>
              </div>
              <span className={`status-pill ${data.tracking.source?.freshness === 'recent' ? 'green' : 'amber'}`}>
                {data.tracking.source?.freshness === 'recent' ? 'Sincronizado' : 'Histórico'}
              </span>
            </div>

            {/* GitHub Item */}
            <div className="source-item-box">
              <div className="source-brand-icon github">
                <Icon path="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </div>
              <div className="source-info">
                <strong>GitHub · Repositorio</strong>
                <p>Rama: <code>{data.github.latest?.data.branch ?? 'Sin lectura'}</code> · {localDate(data.github.latest?.observedAt)}</p>
              </div>
              <span className="status-pill blue">
                {data.github.latest ? 'Lectura guardada' : 'Sin lectura'}
              </span>
            </div>

            {/* Agent workflow */}
            <div className="source-item-box">
              <div className="source-brand-icon agents">
                <Icon path="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2zm8-4a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h2zm-12 0a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2h2z" />
              </div>
              <div className="source-info">
                <strong>Tríada de Agentes</strong>
                <p>Ejecutor · Revisor · Aprobador</p>
              </div>
              <span className="status-pill purple">Secuencial</span>
            </div>
          </div>

          <div className="source-action-footer">
            <button type="button" className="refresh-sources-btn" onClick={() => navigate('operations')}>
              <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              <span>Actualizar fuentes en Operación</span>
            </button>
          </div>
        </section>
      </div>

      {/* Weekly report shortcut */}
      <section className="report-summary-banner">
        <div className="report-icon-container">
          <Icon path={pages.reports.icon} />
        </div>
        <div className="report-text-container">
          <h4>{recent ? `Reporte Semanal: Versión ${recent.version}` : 'Informes periódicos'}</h4>
          <p>
            {recent
              ? `${recent.status === 'draft' ? 'Borrador' : 'Reporte publicado'} al corte ${localDate(recent.cutoff)}. Consulta su evidencia, revisión y límites.`
              : 'Consolida el avance, desviaciones frente a línea base y decisiones en un informe formal.'}
          </p>
        </div>
        <div className="report-btn-wrapper">
          <button type="button" className="report-view-btn" onClick={() => navigate('reports')}>
            <span>{recent ? 'Abrir Reportes' : 'Crear Reporte'}</span>
            <Icon path="M5 12h14 M12 5l7 7-7 7" />
          </button>
        </div>
      </section>
    </div>
  );
}
