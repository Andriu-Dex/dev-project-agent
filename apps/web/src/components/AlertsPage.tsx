import { useEffect, useState } from 'react';
import type { ProjectAccess, ProjectAlertFinding } from '@dev-project-agent/contracts';
import { TrackingPanel } from './TrackingPanel';
import { Icon, navigate } from './Workspace';
import { localDate } from './OverviewPage';

type Assessment = {
  cause: { status: string; text: string };
  impact: string;
  impactedItems: { id: string; name: string }[];
  alternatives: {
    family: string;
    title: string;
    eligible: boolean;
    goal: string;
    benefit: string;
    risk: string;
  }[];
};

type Alert = {
  id: string;
  item_id: string;
  code: string;
  status: 'open' | 'acknowledged' | 'resolved';
  first_seen: string;
  last_seen: string;
  run_id: string;
  payload: {
    finding: ProjectAlertFinding;
    assessment: Assessment;
    snapshotId: string;
    sourceCardHash: string;
    policyVersion: number;
  };
};

type Event = {
  id: string;
  alert_id: string;
  action: 'opened' | 'reopened' | 'observed' | 'resolved' | 'acknowledged' | 'cause_confirmed';
  actor: string | null;
  created_at: string;
  run_id: string;
  detail: {
    note?: string;
    confirmedCause?: string;
    sourceCardHash?: string;
    snapshotId?: string;
    authorization?: boolean;
  };
};

interface AttentionItem {
  label: string;
  badgeClass: string;
  icon: string;
}

const defaultAttention: AttentionItem = {
  label: 'Informativa',
  badgeClass: 'none',
  icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

const attentionConfig: Record<string, AttentionItem> = {
  immediate: {
    label: 'Atención Inmediata',
    badgeClass: 'immediate',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
  upcoming: {
    label: 'Atención Próxima',
    badgeClass: 'upcoming',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  },
  review: {
    label: 'Revisión Requerida',
    badgeClass: 'review',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  none: defaultAttention,
};

function getAttentionInfo(attentionKey?: string): AttentionItem {
  if (!attentionKey) return defaultAttention;
  return attentionConfig[attentionKey] ?? defaultAttention;
}

interface StatusItem {
  label: string;
  badgeClass: string;
}

const defaultStatus: StatusItem = {
  label: 'Abierta',
  badgeClass: 'open',
};

const statusLabels: Record<string, StatusItem> = {
  open: { label: 'Abierta', badgeClass: 'open' },
  acknowledged: { label: 'En seguimiento', badgeClass: 'acknowledged' },
  resolved: { label: 'Resuelta', badgeClass: 'resolved' },
};

function getStatusInfo(statusKey?: string): StatusItem {
  if (!statusKey) return defaultStatus;
  return statusLabels[statusKey] ?? defaultStatus;
}

const codeLabels: Record<string, string> = {
  overdue: 'Vencimiento superado',
  due_soon: 'Próximo a vencer',
  blocked: 'Actividad bloqueada',
  baseline_deviation: 'Desviación de línea base',
  dependency_risk: 'Riesgo de dependencia',
  data_quality: 'Inconsistencia en datos',
};

const eventActionLabels: Record<string, { label: string; icon: string; className: string }> = {
  opened: {
    label: 'Alerta detectada',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    className: 'opened',
  },
  reopened: {
    label: 'Alerta reabierta',
    icon: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    className: 'reopened',
  },
  observed: {
    label: 'Observada en nuevo corte',
    icon: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    className: 'observed',
  },
  acknowledged: {
    label: 'Seguimiento registrado',
    icon: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
    className: 'acknowledged',
  },
  cause_confirmed: {
    label: 'Causa confirmada por gestor',
    icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
    className: 'cause-confirmed',
  },
  resolved: {
    label: 'Alerta resuelta',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    className: 'resolved',
  },
};

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

export function AlertsPage({
  project,
  csrfToken,
}: {
  project: ProjectAccess;
  csrfToken: string;
}) {
  const [data, setData] = useState<{ alerts: Alert[]; events: Event[] } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [cause, setCause] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'active' | 'open' | 'acknowledged' | 'resolved' | 'all'>('active');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'milestone' | 'activity'>('all');
  const [codeFilter, setCodeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [showLiveTracking, setShowLiveTracking] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, severityFilter, kindFilter, codeFilter, search, pageSize]);

  const path = `/api/v1/projects/${project.id}/alerts`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const value = await response.json();
        if (!controller.signal.aborted) {
          setData(value);
          setError('');
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('No se pudieron consultar las alertas guardadas.');
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [path, attempt]);

  // ESC key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected) {
        setSelected('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected]);

  async function acknowledge() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setSuccessNotice('');
    try {
      const currentAlert = data?.alerts.find(a => a.id === selected);
      const response = await fetch(`${path}/${selected}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          note: note.trim(),
          expectedSourceHash: currentAlert?.payload.sourceCardHash,
          ...(cause.trim() ? { confirmedCause: cause.trim() } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'No se pudo guardar el seguimiento.');
      setData(result);
      setNote('');
      setCause('');
      setSuccessNotice('Seguimiento registrado con éxito en el historial oficial.');
      setTimeout(() => setSuccessNotice(''), 4000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  const alerts = data?.alerts ?? [];
  const events = data?.events ?? [];

  // Metrics
  const totalCount = alerts.length;
  const openCount = alerts.filter(a => a.status === 'open').length;
  const acknowledgedCount = alerts.filter(a => a.status === 'acknowledged').length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length;
  const activeCount = openCount + acknowledgedCount;
  const immediateCount = alerts.filter(a => a.status !== 'resolved' && a.payload.finding.attention === 'immediate').length;

  // Filtered alerts
  const visibleAlerts = alerts
    .filter(alert => {
      // Status filter
      if (filter === 'active' && alert.status === 'resolved') return false;
      if (filter === 'open' && alert.status !== 'open') return false;
      if (filter === 'acknowledged' && alert.status !== 'acknowledged') return false;
      if (filter === 'resolved' && alert.status !== 'resolved') return false;

      // Severity filter
      if (severityFilter !== 'all' && alert.payload.finding.attention !== severityFilter) return false;

      // Kind filter
      if (kindFilter !== 'all' && alert.payload.finding.kind !== kindFilter) return false;

      // Code / Reason filter
      if (codeFilter !== 'all' && alert.code !== codeFilter) return false;

      // Search query
      const query = search.trim().toLocaleLowerCase('es');
      if (query) {
        const itemName = alert.payload.finding.itemName.toLocaleLowerCase('es');
        const message = alert.payload.finding.message.toLocaleLowerCase('es');
        const code = (codeLabels[alert.code] ?? alert.code).toLocaleLowerCase('es');
        const causeText = (alert.payload.assessment.cause.text ?? '').toLocaleLowerCase('es');
        if (
          !itemName.includes(query) &&
          !message.includes(query) &&
          !code.includes(query) &&
          !causeText.includes(query)
        ) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const severityOrder: Record<string, number> = {
        immediate: 0,
        upcoming: 1,
        review: 2,
        none: 3,
      };
      const orderA = severityOrder[a.payload.finding.attention] ?? 4;
      const orderB = severityOrder[b.payload.finding.attention] ?? 4;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(visibleAlerts.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = visibleAlerts.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, visibleAlerts.length);
  const paginatedAlerts = visibleAlerts.slice(startIndex, endIndex);
  const pageRange = getPaginationRange(safePage, totalPages);

  const detail = alerts.find(a => a.id === selected);
  const detailEvents = detail ? events.filter(e => e.alert_id === detail.id) : [];
  const confirmedCause = detail
    ? events.find(
        e =>
          e.alert_id === detail.id &&
          e.detail.sourceCardHash === detail.payload.sourceCardHash &&
          e.detail.confirmedCause
      )?.detail.confirmedCause
    : undefined;

  const prepare = (alert: Alert, goal: string, family: string) => {
    if (family === 'keep_plan') {
      setNote(goal);
      const followUpInput = document.getElementById('alert-follow-up-note');
      followUpInput?.focus();
      return;
    }
    sessionStorage.setItem(
      'proposal-suggestion:' + project.id,
      JSON.stringify({
        cardId: alert.item_id,
        goal,
        family,
        alertId: alert.id,
      })
    );
    navigate('proposals');
  };

  return (
    <div className="alerts-dashboard">
      {/* Top Banner / Supervision Context */}
      <section className="alerts-hero-banner">
        <div className="alerts-hero-main">
          <div className="alerts-live-badge">
            <span className="live-pulse-dot" />
            <span>CENTRO DE ALERTAS Y RESPUESTA</span>
          </div>
          <h2 className="alerts-hero-title">Alertas con seguimiento supervisado</h2>
          <p className="alerts-hero-subtitle">
            Se generan automáticamente al completar un análisis de supervisión con lectura reciente.
            Reconocer o registrar seguimiento documenta las decisiones del gestor sin autorizar cambios externos directos.
          </p>
        </div>

        <div className="alerts-hero-actions">
          <button
            type="button"
            className="alerts-refresh-btn"
            onClick={() => {
              setError('');
              setAttempt(v => v + 1);
            }}
            title="Consultar nuevamente las alertas guardadas"
          >
            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            <span>Actualizar alertas</span>
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="alerts-error-banner">
          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="alerts-kpi-grid">
        <div className="alerts-kpi-card">
          <div className="kpi-icon-box total">
            <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Alertas Activas</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{activeCount}</strong>
              <span className="kpi-subtext">de {totalCount} registradas</span>
            </div>
          </div>
        </div>

        <div className={'alerts-kpi-card' + (immediateCount > 0 ? ' has-danger' : '')}>
          <div className="kpi-icon-box danger">
            <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Atención Inmediata</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{immediateCount}</strong>
              <span className="kpi-subtext">{immediateCount > 0 ? 'Riesgo alto / Bloqueo' : 'Ninguna crítica'}</span>
            </div>
          </div>
        </div>

        <div className="alerts-kpi-card">
          <div className="kpi-icon-box progress">
            <Icon path="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">En Seguimiento</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{acknowledgedCount}</strong>
              <span className="kpi-subtext">{openCount} aún abiertas</span>
            </div>
          </div>
        </div>

        <div className="alerts-kpi-card">
          <div className="kpi-icon-box success">
            <Icon path="M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Resueltas</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{resolvedCount}</strong>
              <span className="kpi-subtext">Mitigadas con éxito</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <section className="alerts-filter-panel">
        <div className="alerts-filter-tabs">
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'active' ? ' is-active' : '')}
            onClick={() => setFilter('active')}
          >
            <span>Activas</span>
            <span className="pill-badge">{activeCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'open' ? ' is-active' : '')}
            onClick={() => setFilter('open')}
          >
            <span>Abiertas</span>
            <span className="pill-badge red">{openCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'acknowledged' ? ' is-active' : '')}
            onClick={() => setFilter('acknowledged')}
          >
            <span>En seguimiento</span>
            <span className="pill-badge blue">{acknowledgedCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'resolved' ? ' is-active' : '')}
            onClick={() => setFilter('resolved')}
          >
            <span>Resueltas</span>
            <span className="pill-badge green">{resolvedCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'all' ? ' is-active' : '')}
            onClick={() => setFilter('all')}
          >
            <span>Todas</span>
            <span className="pill-badge">{totalCount}</span>
          </button>
        </div>

        <div className="alerts-secondary-controls">
          <div className="alerts-search-box">
            <Icon path="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
            <input
              type="search"
              placeholder="Buscar por actividad, diagnóstico o causa…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Buscar alertas"
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
              >
                <Icon path="M18 6L6 18 M6 6l12 12" />
              </button>
            )}
          </div>

          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="alerts-select"
            aria-label="Filtrar por severidad"
          >
            <option value="all">Todas las prioridades</option>
            <option value="immediate">Atención inmediata (Crítica)</option>
            <option value="upcoming">Atención próxima</option>
            <option value="review">Revisión requerida</option>
          </select>

          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as 'all' | 'milestone' | 'activity')}
            className="alerts-select"
            aria-label="Filtrar por tipo de elemento"
          >
            <option value="all">Todos los tipos</option>
            <option value="milestone">Solo Hitos</option>
            <option value="activity">Solo Actividades</option>
          </select>

          <select
            value={codeFilter}
            onChange={e => setCodeFilter(e.target.value)}
            className="alerts-select"
            aria-label="Filtrar por motivo de alerta"
          >
            <option value="all">Todos los motivos</option>
            <option value="overdue">Vencimiento superado</option>
            <option value="due_soon">Próximo a vencer</option>
            <option value="blocked">Actividad bloqueada</option>
            <option value="baseline_deviation">Desviación de línea base</option>
            <option value="dependency_risk">Riesgo de dependencia</option>
            <option value="data_quality">Inconsistencia en datos</option>
          </select>
        </div>
      </section>

      {/* Alerts Main Container */}
      {!data && !error && (
        <section className="alerts-loading-state">
          <div className="loading-spinner-wrapper">
            <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
          </div>
          <p>Consultando el registro oficial de alertas…</p>
        </section>
      )}

      {data && (
        <section className="alerts-list-container">
          <div className="alerts-list-header">
            <span className="alerts-list-count">
              Mostrando <strong>{visibleAlerts.length}</strong> {visibleAlerts.length === 1 ? 'alerta' : 'alertas'}
              {visibleAlerts.length !== totalCount ? ` (filtradas de ${totalCount})` : ''}
            </span>
          </div>

          {visibleAlerts.length === 0 ? (
            <div className="alerts-empty-state">
              <div className="empty-icon-shield">
                <Icon path="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </div>
              <h3>No se encontraron alertas</h3>
              <p>
                {alerts.length === 0
                  ? 'No hay alertas registradas en este proyecto. Todo el cronograma y dependencias se encuentran al día.'
                  : 'No hay alertas que coincidan con los filtros aplicados actualmente.'}
              </p>
              {alerts.length > 0 && (
                <button
                  type="button"
                  className="alerts-reset-filters-btn"
                  onClick={() => {
                    setFilter('active');
                    setSeverityFilter('all');
                    setKindFilter('all');
                    setCodeFilter('all');
                    setSearch('');
                    setCurrentPage(1);
                  }}
                >
                  Restablecer filtros
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="alerts-cards-list">
                {paginatedAlerts.map(alert => {
                  const att = getAttentionInfo(alert.payload.finding.attention);
                  const statusInfo = getStatusInfo(alert.status);
                  const codeName = codeLabels[alert.code] ?? alert.code;
                  const isSelected = selected === alert.id;

                  return (
                    <article
                      key={alert.id}
                      className={
                        'alert-item-card ' +
                        att.badgeClass +
                        (isSelected ? ' is-selected' : '') +
                        (alert.status === 'resolved' ? ' is-resolved' : '')
                      }
                      onClick={() => {
                        setSelected(isSelected ? '' : alert.id);
                        setNote('');
                        setCause('');
                      }}
                    >
                      <div className={'alert-severity-indicator ' + att.badgeClass} title={att.label}>
                        <Icon path={att.icon} />
                      </div>

                      <div className="alert-content-area">
                        <div className="alert-meta-top">
                          <span className={'alert-kind-badge ' + alert.payload.finding.kind}>
                            {alert.payload.finding.kind === 'milestone' ? 'Hito' : 'Actividad'}
                          </span>
                          <span className="alert-code-chip">{codeName}</span>
                          <span className={'alert-status-badge ' + statusInfo.badgeClass}>
                            {statusInfo.label}
                          </span>
                        </div>

                        <h3 className="alert-item-title">{alert.payload.finding.itemName}</h3>

                        <p className="alert-item-message">{alert.payload.finding.message}</p>

                        <div className="alert-footer-meta">
                          <span className="alert-observed-time">
                            Última observación: <strong>{localDate(alert.last_seen)}</strong>
                          </span>
                          {alert.payload.assessment.impactedItems.length > 0 && (
                            <span className="alert-impact-count-badge">
                              {alert.payload.assessment.impactedItems.length}{' '}
                              {alert.payload.assessment.impactedItems.length === 1
                                ? 'elemento impactado'
                                : 'elementos impactados'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="alert-action-arrow">
                        <button
                          type="button"
                          className="alert-detail-trigger-btn"
                          onClick={e => {
                            e.stopPropagation();
                            setSelected(isSelected ? '' : alert.id);
                            setNote('');
                            setCause('');
                          }}
                          aria-expanded={isSelected}
                          title="Ver diagnóstico completo y alternativas de mitigación"
                        >
                          <span>Detalle</span>
                          <Icon path="M9 5l7 7-7 7" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {visibleAlerts.length > 0 && (
                <footer className="planning-pagination-bar">
                  <div className="pagination-summary">
                    <span>{startIndex + 1}–{endIndex} de <strong>{visibleAlerts.length}</strong></span>
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

                    {pageRange.map((pageItem, idx) => {
                      if (pageItem === 'ellipsis') {
                        return (
                          <span key={`ellipsis-${idx}`} className="pagination-ellipsis" aria-hidden="true">
                            …
                          </span>
                        );
                      }
                      const isCurrent = pageItem === safePage;
                      return (
                        <button
                          key={pageItem}
                          type="button"
                          className={'pagination-number-btn' + (isCurrent ? ' is-active' : '')}
                          onClick={() => setCurrentPage(pageItem)}
                          aria-label={`Página ${pageItem}`}
                          aria-current={isCurrent ? 'page' : undefined}
                        >
                          {pageItem}
                        </button>
                      );
                    })}

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
                      id="alerts-page-size"
                      className="pagination-pagesize-select"
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                      aria-label="Cantidad de alertas por página"
                    >
                      <option value={10}>10 / pág</option>
                      <option value={20}>20 / pág</option>
                      <option value={50}>50 / pág</option>
                    </select>
                  </div>
                </footer>
              )}
            </>
          )}
        </section>
      )}

      {/* Slide-over Detail Drawer */}
      {detail && (() => {
        const detailAtt = getAttentionInfo(detail.payload.finding.attention);
        const detailStatus = getStatusInfo(detail.status);
        return (
        <div
          className="alerts-drawer-backdrop"
          onClick={() => setSelected('')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-drawer-title"
        >
          <aside className="alerts-detail-drawer" onClick={e => e.stopPropagation()}>
            <header className="drawer-header">
              <div className="drawer-header-meta">
                <span className={'alert-severity-pill ' + detailAtt.badgeClass}>
                  <Icon path={detailAtt.icon} />
                  <span>{detailAtt.label}</span>
                </span>
                <span className={'alert-status-badge ' + detailStatus.badgeClass}>
                  {detailStatus.label}
                </span>
                <span className="alert-code-chip">{codeLabels[detail.code] ?? detail.code}</span>
              </div>

              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelected('')}
                aria-label="Cerrar detalle"
                title="Cerrar (Esc)"
              >
                <Icon path="M18 6L6 18 M6 6l12 12" />
              </button>
            </header>

            <div className="drawer-scroll-body">
              <div className="drawer-title-area">
                <h3 id="alert-drawer-title">{detail.payload.finding.itemName}</h3>
                <p className="drawer-submessage">{detail.payload.finding.message}</p>
              </div>

              <div className="drawer-content-flow">
              {successNotice && (
                <div role="status" className="drawer-success-banner">
                  <Icon path="M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" />
                  <span>{successNotice}</span>
                </div>
              )}

              {/* Section 1: Diagnóstico de Causa e Impacto */}
              <section className="drawer-section-card">
                <div className="section-card-header">
                  <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <h4>Diagnóstico de causa e impacto</h4>
                </div>

                <div className="diagnosis-block">
                  <div className="cause-label-row">
                    <span className={'cause-nature-tag ' + (confirmedCause ? 'confirmed' : detail.payload.assessment.cause.status)}>
                      {confirmedCause
                        ? 'Causa confirmada por el gestor'
                        : detail.payload.assessment.cause.status === 'documented'
                        ? 'Causa declarada en la fuente'
                        : 'Hipótesis por comprobar'}
                    </span>
                  </div>
                  <p className="cause-description-text">
                    {confirmedCause ?? detail.payload.assessment.cause.text}
                  </p>
                </div>

                <div className="impact-block">
                  <span className="block-label">Impacto proyectado</span>
                  <p className="impact-description-text">{detail.payload.assessment.impact}</p>

                  {detail.payload.assessment.impactedItems.length > 0 && (
                    <div className="impacted-items-box">
                      <span className="impacted-sublabel">Elementos directamente afectados:</span>
                      <ul className="impacted-items-list">
                        {detail.payload.assessment.impactedItems.map(item => (
                          <li key={item.id} className="impacted-item-row">
                            <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                            <span>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>

              {/* Section 2: Alternativas para el Gestor */}
              <section className="drawer-section-card">
                <div className="section-card-header accent">
                  <Icon path="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  <h4>Alternativas de mitigación formuladas por el Agente</h4>
                </div>
                <p className="section-instruction">
                  Revisa los escenarios evaluados para mitigar este desvío. Preparar una revisión no aplica cambios sin tu autorización explícita.
                </p>

                <div className="alternatives-grid">
                  {detail.payload.assessment.alternatives.map(option => (
                    <div
                      key={option.family}
                      className={'alternative-box' + (!option.eligible ? ' is-ineligible' : '')}
                    >
                      <div className="alternative-box-header">
                        <h5>{option.title}</h5>
                        <span className={'alternative-eligibility-chip ' + (option.eligible ? 'eligible' : 'ineligible')}>
                          {option.eligible ? 'Viable' : 'Faltan datos'}
                        </span>
                      </div>

                      <div className="alternative-benefit-row">
                        <strong>Beneficio:</strong>
                        <span>{option.benefit}</span>
                      </div>

                      <div className="alternative-risk-row">
                        <strong>Riesgo asociado:</strong>
                        <span>{option.risk}</span>
                      </div>

                      {project.canManageProject && (
                        <div className="alternative-action-row">
                          <button
                            type="button"
                            disabled={!option.eligible}
                            className="alternative-prepare-btn"
                            onClick={() => prepare(detail, option.goal, option.family)}
                          >
                            <span>
                              {option.family === 'keep_plan'
                                ? 'Mantener plan y justificar'
                                : 'Preparar propuesta de cambio'}
                            </span>
                            <Icon path="M5 12h14 M12 5l7 7-7 7" />
                          </button>
                        </div>
                      )}
                      {!option.eligible && (
                        <small className="ineligible-hint">
                          Faltan datos o configuración en el tablero para aplicar esta alternativa.
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Section 3: Registro de Seguimiento Humano */}
              {project.canManageProject && detail.status !== 'resolved' && (
                <section className="drawer-section-card follow-up">
                  <div className="section-card-header manager">
                    <Icon path="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    <h4>Registrar seguimiento del gestor</h4>
                  </div>

                  <form
                    className="follow-up-form"
                    onSubmit={e => {
                      e.preventDefault();
                      void acknowledge();
                    }}
                  >
                    <div className="form-field">
                      <label htmlFor="alert-follow-up-note">
                        Nota de seguimiento <span>(obligatoria)</span>
                      </label>
                      <textarea
                        id="alert-follow-up-note"
                        value={note}
                        required
                        minLength={3}
                        maxLength={2000}
                        disabled={busy}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Describe el estado de la gestión, acuerdos con el responsable o justificación…"
                        rows={3}
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="alert-confirmed-cause">
                        Causa confirmada por el gestor <span>(opcional)</span>
                      </label>
                      <textarea
                        id="alert-confirmed-cause"
                        value={cause}
                        maxLength={2000}
                        disabled={busy}
                        onChange={e => setCause(e.target.value)}
                        placeholder="Si identificaste la causa de fondo técnica o de equipo, regístrala para el historial oficial…"
                        rows={2}
                      />
                    </div>

                    <div className="form-submit-row">
                      <button type="submit" disabled={busy || note.trim().length < 3} className="submit-follow-up-btn">
                        {busy ? (
                          <>
                            <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
                            <span>Guardando…</span>
                          </>
                        ) : (
                          <>
                            <Icon path="M5 13l4 4L19 7" />
                            <span>Registrar seguimiento</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* Section 4: Línea de Tiempo y Auditoría */}
              <section className="drawer-section-card timeline">
                <div className="section-card-header">
                  <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
                  <h4>Línea de tiempo de auditoría</h4>
                </div>

                <div className="audit-source-hint">
                  Lectura del corte: <code>{detail.payload.snapshotId}</code> · Versión de política:{' '}
                  <strong>{detail.payload.policyVersion}</strong>
                </div>

                <div className="audit-timeline">
                  {detailEvents.length === 0 ? (
                    <p className="empty-timeline-note">No se han registrado eventos adicionales para esta alerta.</p>
                  ) : (
                    detailEvents.map(evt => {
                      const actionInfo = eventActionLabels[evt.action] ?? {
                        label: evt.action,
                        icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
                        className: 'default',
                      };

                      return (
                        <div key={evt.id} className={'timeline-item ' + actionInfo.className}>
                          <div className={'timeline-node-dot ' + actionInfo.className}>
                            <Icon path={actionInfo.icon} />
                          </div>

                          <div className="timeline-item-content">
                            <div className="timeline-header-line">
                              <strong className="timeline-action-name">{actionInfo.label}</strong>
                              <span className="timeline-timestamp">{localDate(evt.created_at)}</span>
                            </div>
                            <span className="timeline-actor-name">
                              Por: <strong>{evt.actor ?? 'Servicio automático'}</strong>
                            </span>

                            {evt.detail.note && (
                              <p className="timeline-note-text">«{evt.detail.note}»</p>
                            )}

                            {evt.detail.confirmedCause && (
                              <div className="timeline-cause-chip">
                                <strong>Causa confirmada:</strong> {evt.detail.confirmedCause}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
              </div>
            </div>
          </aside>
        </div>
        );
      })()}

      {/* Live Supervision Evaluation Accordion */}
      <section className="alerts-live-evaluation-card">
        <button
          type="button"
          className="live-evaluation-toggle-btn"
          onClick={() => setShowLiveTracking(v => !v)}
          aria-expanded={showLiveTracking}
        >
          <div className="toggle-btn-left">
            <div className="toggle-icon-pill">
              <Icon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </div>
            <div className="toggle-text-block">
              <h3>Evaluación del corte actual en vivo</h3>
              <p>Inspecciona las métricas de avance, holguras y políticas del último análisis supervisado</p>
            </div>
          </div>

          <div className="toggle-btn-right">
            <span className="toggle-state-text">{showLiveTracking ? 'Ocultar' : 'Examinar'}</span>
            <div className={'chevron-rotator' + (showLiveTracking ? ' is-open' : '')}>
              <Icon path="M19 9l-7 7-7-7" />
            </div>
          </div>
        </button>

        {showLiveTracking && (
          <div className="live-evaluation-panel-content">
            <TrackingPanel
              projectId={project.id}
              csrfToken={csrfToken}
              canManage={false}
              showSettings={false}
            />
          </div>
        )}
      </section>
    </div>
  );
}
