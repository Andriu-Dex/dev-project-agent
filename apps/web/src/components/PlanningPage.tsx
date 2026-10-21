import { useEffect, useState } from 'react';
import type { ProjectAccess, TrackingResponse, TrelloItem, TrelloOverview } from '@dev-project-agent/contracts';
import { localDate } from './OverviewPage';
import { Icon, navigate } from './Workspace';
import { Pagination } from './Pagination';

const stateLabels: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completada',
  unknown: 'Sin estado',
};

const stateIcons: Record<string, string> = {
  pending: 'M12 6v6l4 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', // Clock
  in_progress: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83', // Spinner / Activity
  completed: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3', // Check circle
  unknown: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', // Help circle
};

const getStateIcon = (state: string): string =>
  stateIcons[state] ?? stateIcons.unknown ?? 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z';

export function PlanningPage({ project }: { project: ProjectAccess }) {
  const [data, setData] = useState<{ trello: TrelloOverview; tracking: TrackingResponse } | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<string>('default');
  const [selected, setSelected] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, priorityFilter, memberFilter, urgencyFilter, sortOrder, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    const base = '/api/v1/projects/' + project.id;
    async function load() {
      try {
        const [trello, tracking] = await Promise.all(
          ['trello', 'tracking'].map(async path => {
            const response = await fetch(base + '/' + path, { signal: controller.signal });
            if (!response.ok) throw new Error();
            return response.json();
          })
        );
        if (!controller.signal.aborted) {
          setData({ trello, tracking });
          setError('');
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('No se pudo cargar la planificación. Tus datos guardados se conservan.');
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [project.id]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected) {
        setSelected('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected]);

  const snapshot = data?.trello.latest;
  const items = snapshot?.data.items.filter(item => !item.archived && item.kind !== 'reference') ?? [];
  const statuses = new Map(data?.tracking.items.map(item => [item.itemId, item]));

  const getMemberName = (id: string) =>
    snapshot?.data.members.find(member => member.id === id)?.displayName ?? 'Sin resolver';

  // Metrics calculation
  const totalCount = items.length;
  const inProgressCount = items.filter(i => (statuses.get(i.id)?.declaredState ?? i.state) === 'in_progress').length;
  const pendingCount = items.filter(i => (statuses.get(i.id)?.declaredState ?? i.state) === 'pending').length;
  const overdueCount = items.filter(i => statuses.get(i.id)?.schedule === 'overdue').length;
  const blockedCount = items.filter(i => statuses.get(i.id)?.blocked).length;
  const completedCount = items.filter(i => (statuses.get(i.id)?.declaredState ?? i.state) === 'completed').length;
  const milestoneCount = items.filter(i => i.kind === 'milestone').length;

  // Filtered items
  const visible = items.filter(item => {
    const tracking = statuses.get(item.id);
    const itemState = tracking?.declaredState ?? item.state;
    const principalName = item.planning?.principal ?? item.memberIds.map(getMemberName).join(' ');
    const labelsText = item.labelNames.join(' ');
    const query = search.trim().toLocaleLowerCase('es');

    const matchesSearch =
      !query ||
      item.name.toLocaleLowerCase('es').includes(query) ||
      (item.planning?.wbs ?? '').toLocaleLowerCase('es').includes(query) ||
      principalName.toLocaleLowerCase('es').includes(query) ||
      labelsText.toLocaleLowerCase('es').includes(query);

    if (!matchesSearch) return false;

    // Tab filter
    if (filter === 'in_progress' && itemState !== 'in_progress') return false;
    if (filter === 'pending' && itemState !== 'pending') return false;
    if (filter === 'completed' && itemState !== 'completed') return false;
    if (filter === 'overdue' && tracking?.schedule !== 'overdue') return false;
    if (filter === 'blocked' && !tracking?.blocked) return false;
    if (filter === 'milestone' && item.kind !== 'milestone') return false;

    // Priority filter
    if (priorityFilter !== 'all' && tracking?.priority !== priorityFilter) return false;

    // Member filter
    if (memberFilter !== 'all' && !item.memberIds.includes(memberFilter)) return false;

    // Urgency & Deadline filter
    if (urgencyFilter === 'overdue' && tracking?.schedule !== 'overdue') return false;
    if (urgencyFilter === 'due_soon') {
      const isDueSoon =
        tracking?.schedule === 'due_soon' ||
        (Boolean(item.due) &&
          itemState !== 'completed' &&
          new Date(item.due!).getTime() - Date.now() <= 7 * 86400000 &&
          new Date(item.due!).getTime() >= Date.now());
      if (!isDueSoon) return false;
    }
    if (urgencyFilter === 'due_14') {
      const isDue14 =
        Boolean(item.due) &&
        itemState !== 'completed' &&
        new Date(item.due!).getTime() - Date.now() <= 14 * 86400000 &&
        new Date(item.due!).getTime() >= Date.now();
      if (!isDue14) return false;
    }
    if (urgencyFilter === 'with_deviations') {
      const hasDeviation =
        tracking?.schedule === 'overdue' ||
        tracking?.blocked === true ||
        (tracking?.qualityIssues?.length ?? 0) > 0 ||
        tracking?.attention === 'immediate' ||
        tracking?.attention === 'upcoming';
      if (!hasDeviation) return false;
    }

    return true;
  })
  .sort((a, b) => {
    if (sortOrder === 'due_asc') {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    }
    if (sortOrder === 'due_desc') {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(b.due).getTime() - new Date(a.due).getTime();
    }
    if (sortOrder === 'overdue_desc') {
      const trA = statuses.get(a.id);
      const trB = statuses.get(b.id);
      const hoursA = trA?.overdueHours ?? 0;
      const hoursB = trB?.overdueHours ?? 0;
      if (hoursA !== hoursB) return hoursB - hoursA;
      return 0;
    }
    if (sortOrder === 'name_asc') {
      return a.name.localeCompare(b.name, 'es');
    }
    // Default: natural WBS sorting
    const wbsA = a.planning?.wbs ?? '';
    const wbsB = b.planning?.wbs ?? '';
    if (wbsA && wbsB) {
      return wbsA.localeCompare(wbsB, undefined, { numeric: true });
    }
    if (wbsA) return -1;
    if (wbsB) return 1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = visible.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, visible.length);
  const paginatedItems = visible.slice(startIndex, endIndex);

  const detail: TrelloItem | undefined = items.find(item => item.id === selected);
  const detailTracking = detail ? statuses.get(detail.id) : undefined;

  return (
    <div className="planning-dashboard">
      {/* Top Banner / Trello Board Context */}
      <section className="planning-source-card">
        <div className="source-card-main">
          <div className="source-status-badge">
            <span className="live-pulse-dot" />
            <span>TABLERO TRELLO SINCRONIZADO</span>
          </div>
          <h2 className="source-board-title">{snapshot?.data.board.name ?? 'Tablero del proyecto'}</h2>
          <p className="source-board-meta">
            Última observación fechada: <strong>{localDate(snapshot?.observedAt)}</strong> · Los estados reflejan declaraciones de la fuente oficial.
          </p>
        </div>
        <div className="source-card-actions">
          <button
            type="button"
            className="source-sync-link-btn"
            onClick={() => navigate('operations')}
            title="Ir a Operación para sincronizar fuentes"
          >
            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            <span>Sincronizar fuentes</span>
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="planning-alert-banner">
          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="planning-kpi-grid">
        <div className="planning-kpi-card">
          <div className="kpi-icon-box total">
            <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Actividades e hitos</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{totalCount}</strong>
              <span className="kpi-subtext">{totalCount - milestoneCount} actividades · {milestoneCount} hitos</span>
            </div>
          </div>
        </div>

        <div className="planning-kpi-card">
          <div className="kpi-icon-box progress">
            <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">En Curso</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{inProgressCount}</strong>
              <span className="kpi-subtext">{pendingCount} pendientes</span>
            </div>
          </div>
        </div>

        <div className={'planning-kpi-card' + (overdueCount > 0 ? ' has-alert' : '')}>
          <div className="kpi-icon-box overdue">
            <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Vencidas</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{overdueCount}</strong>
              <span className="kpi-subtext">{overdueCount > 0 ? 'Requieren atención' : 'Al día'}</span>
            </div>
          </div>
        </div>

        <div className={'planning-kpi-card' + (blockedCount > 0 ? ' has-warning' : '')}>
          <div className="kpi-icon-box blocked">
            <Icon path="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Bloqueadas</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{blockedCount}</strong>
              <span className="kpi-subtext">{completedCount} completadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <section className="planning-filter-panel">
        <div className="planning-filter-tabs">
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'all' ? ' is-active' : '')}
            onClick={() => setFilter('all')}
          >
            <span>Todas</span>
            <span className="pill-badge">{totalCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'in_progress' ? ' is-active' : '')}
            onClick={() => setFilter('in_progress')}
          >
            <span>En curso</span>
            <span className="pill-badge blue">{inProgressCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'pending' ? ' is-active' : '')}
            onClick={() => setFilter('pending')}
          >
            <span>Pendientes</span>
            <span className="pill-badge">{pendingCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'overdue' ? ' is-active' : '')}
            onClick={() => setFilter('overdue')}
          >
            <span>Vencidas</span>
            <span className={'pill-badge' + (overdueCount > 0 ? ' red' : '')}>{overdueCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'blocked' ? ' is-active' : '')}
            onClick={() => setFilter('blocked')}
          >
            <span>Bloqueadas</span>
            <span className={'pill-badge' + (blockedCount > 0 ? ' amber' : '')}>{blockedCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'completed' ? ' is-active' : '')}
            onClick={() => setFilter('completed')}
          >
            <span>Completadas</span>
            <span className="pill-badge green">{completedCount}</span>
          </button>
          <button
            type="button"
            className={'filter-pill-btn' + (filter === 'milestone' ? ' is-active' : '')}
            onClick={() => setFilter('milestone')}
          >
            <span>Hitos</span>
            <span className="pill-badge purple">{milestoneCount}</span>
          </button>
        </div>

        <div className="planning-secondary-controls">
          <div className="planning-search-box">
            <Icon path="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
            <input
              type="search"
              placeholder="Buscar por actividad, código WBS o responsable…"
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label="Buscar actividades"
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

          <div className="planning-select-group">
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              aria-label="Ordenar actividades"
              className="planning-select"
            >
              <option value="default">Orden: Plan / WBS</option>
              <option value="due_asc">Vencimiento (más próximo)</option>
              <option value="due_desc">Vencimiento (más lejano)</option>
              <option value="overdue_desc">Mayor retraso (horas)</option>
              <option value="name_asc">Nombre (A–Z)</option>
            </select>

            <select
              value={urgencyFilter}
              onChange={e => setUrgencyFilter(e.target.value)}
              aria-label="Filtrar por plazo o desvío"
              className="planning-select"
            >
              <option value="all">Cualquier plazo</option>
              <option value="overdue">Solo vencidas</option>
              <option value="due_soon">Vencen en 7 días</option>
              <option value="due_14">Vencen en 14 días</option>
              <option value="with_deviations">Con desvíos u observaciones</option>
            </select>

            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              aria-label="Filtrar por prioridad"
              className="planning-select"
            >
              <option value="all">Cualquier prioridad</option>
              <option value="high">Prioridad Alta</option>
              <option value="medium">Prioridad Media</option>
              <option value="low">Prioridad Baja</option>
            </select>

            <select
              value={memberFilter}
              onChange={e => setMemberFilter(e.target.value)}
              aria-label="Filtrar por responsable"
              className="planning-select"
            >
              <option value="all">Todos los responsables</option>
              {snapshot?.data.members.map(member => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Main Table or Empty State */}
      {!data && !error && (
        <section className="planning-loading-state">
          <div className="loading-spinner-wrapper">
            <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
          </div>
          <p>Consultando la planificación del proyecto supervisado…</p>
        </section>
      )}

      {data && !snapshot && (
        <section className="planning-empty-state">
          <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          <h3>Todavía no hay una lectura registrada</h3>
          <p className="muted">Actualiza las fuentes de datos para importar las tarjetas de Trello.</p>
          <button type="button" className="hero-primary-btn" onClick={() => navigate('operations')}>
            <span>Ir a Operación</span>
          </button>
        </section>
      )}

      {snapshot && (
        <div className="planning-table-container">
          <div className="table-header-bar">
            <span className="table-count-label">
              Total de actividades e hitos: <strong>{visible.length}</strong> {visible.length !== items.length ? `(de ${items.length} en el tablero)` : ''}
            </span>
          </div>

          <div className="table-scroll-wrapper">
            <table className="planning-modern-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '38%' }}>Actividad / Hito</th>
                  <th scope="col" style={{ width: '20%' }}>Responsable</th>
                  <th scope="col" style={{ width: '16%' }}>Estado y Salud</th>
                  <th scope="col" style={{ width: '16%' }}>Cronograma</th>
                  <th scope="col" style={{ width: '10%', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(item => {
                  const tracking = statuses.get(item.id);
                  const state = tracking?.declaredState ?? item.state;
                  const isOverdue = tracking?.schedule === 'overdue';
                  const isBlocked = tracking?.blocked;
                  const principal = item.planning?.principal ?? (item.memberIds.map(getMemberName).join(', ') || 'Sin asignar');
                  const initials = principal.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '—';
                  const isSelected = selected === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={isSelected ? 'is-selected-row' : ''}
                      onClick={() => setSelected(isSelected ? '' : item.id)}
                    >
                      <td>
                        <div className="activity-cell">
                          <div className="activity-meta-line">
                            <span className="wbs-code-badge" title="Código de Estructura de Desglose de Trabajo">
                              {item.planning?.wbs ? `WBS ${item.planning.wbs}` : 'Sin WBS'}
                            </span>
                            <span className={'kind-badge ' + item.kind}>
                              {item.kind === 'milestone' ? 'Hito' : 'Actividad'}
                            </span>
                            {tracking?.priority && (
                              <span className={'priority-badge ' + tracking.priority}>
                                {tracking.priority === 'high' ? 'Alta' : tracking.priority === 'medium' ? 'Media' : 'Baja'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="activity-title-link"
                            onClick={e => {
                              e.stopPropagation();
                              setSelected(isSelected ? '' : item.id);
                            }}
                            aria-expanded={isSelected}
                          >
                            {item.name}
                          </button>
                          {item.labelNames.length > 0 && (
                            <div className="labels-chip-row">
                              {item.labelNames.map(label => (
                                <span key={label} className="label-chip">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="responsible-cell">
                          <span className="responsible-avatar" aria-hidden="true">
                            {initials}
                          </span>
                          <span className="responsible-name">{principal}</span>
                        </div>
                      </td>

                      <td>
                        <div className="state-health-cell">
                          <span className={'status-tag-pill ' + state}>
                            <Icon path={getStateIcon(state)} />
                            <span>{stateLabels[state] ?? state}</span>
                          </span>
                          <div className="health-badges-row">
                            {isOverdue && (
                              <span className="health-pill overdue" title="Actividad vencida según fecha límite">
                                <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <span>Vencida</span>
                              </span>
                            )}
                            {isBlocked && (
                              <span className="health-pill blocked" title="Actividad reportada como bloqueada">
                                <Icon path="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
                                <span>Bloqueada</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="schedule-cell">
                          <div className="date-row" title="Fecha de inicio informada">
                            <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            <span>{item.start ? localDate(item.start) : 'Sin inicio'}</span>
                          </div>
                          <div className={'date-row' + (isOverdue ? ' date-overdue' : '')} title="Fecha límite de vencimiento">
                            <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
                            <span>{item.due ? localDate(item.due) : 'Sin vencimiento'}</span>
                          </div>
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="view-detail-btn"
                          onClick={e => {
                            e.stopPropagation();
                            setSelected(item.id);
                          }}
                          aria-label={`Ver detalles de ${item.name}`}
                          title="Ver ficha completa"
                        >
                          <span>Detalle</span>
                          <Icon path="M9 5l7 7-7 7" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!visible.length && (
              <div className="table-empty-notice">
                <Icon path="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
                <p>No se encontraron actividades que coincidan con los filtros aplicados.</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                    setPriorityFilter('all');
                    setMemberFilter('all');
                    setUrgencyFilter('all');
                    setSortOrder('default');
                  }}
                >
                  Restablecer filtros
                </button>
              </div>
            )}
          </div>

          {visible.length > 0 && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              totalItems={visible.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50]}
              sizeSelectId="planning-page-size"
              sizeSelectLabel="Cantidad de filas por página"
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>
      )}

      {/* Slide-over Detail Drawer */}
      {detail && (
        <div
          className="planning-drawer-backdrop"
          onClick={() => setSelected('')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-detail-title"
        >
          <aside className="planning-detail-drawer" onClick={e => e.stopPropagation()}>
            <header className="drawer-header">
              <div className="drawer-header-meta">
                <span className="wbs-code-badge large">
                  {detail.planning?.wbs ? `WBS ${detail.planning.wbs}` : 'Sin WBS'}
                </span>
                <span className={'kind-badge ' + detail.kind}>
                  {detail.kind === 'milestone' ? 'Hito' : 'Actividad'}
                </span>
                {detailTracking?.priority && (
                  <span className={'priority-badge ' + detailTracking.priority}>
                    Prioridad {detailTracking.priority === 'high' ? 'Alta' : detailTracking.priority === 'medium' ? 'Media' : 'Baja'}
                  </span>
                )}
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
                <h3 id="drawer-detail-title">{detail.name}</h3>
              </div>

              <div className="drawer-content-flow">
              {/* Quick Status / Health Cards */}
              <div className="drawer-card-meta-grid">
                <div className="drawer-meta-box">
                  <span className="meta-box-label">Estado Declarado</span>
                  <span className={'status-tag-pill ' + (detailTracking?.declaredState ?? detail.state)}>
                    <Icon path={getStateIcon(detailTracking?.declaredState ?? detail.state)} />
                    <span>{stateLabels[detailTracking?.declaredState ?? detail.state] ?? detail.state}</span>
                  </span>
                </div>

                <div className="drawer-meta-box">
                  <span className="meta-box-label">Responsable declarado</span>
                  <strong className="meta-box-value">
                    {detail.planning?.principal ?? (detail.memberIds.map(getMemberName).join(', ') || 'Sin asignar')}
                  </strong>
                </div>
                <div className="drawer-meta-box">
                  <span className="meta-box-label">Asignados nativos en Trello</span>
                  <span className="meta-box-value">{detail.memberIds.map(getMemberName).join(', ') || 'Sin asignar'}</span>
                </div>
                <div className="drawer-meta-box">
                  <span className="meta-box-label">Prioridad y bloqueo</span>
                  <span className="meta-box-value">{detailTracking?.priority ? ({high:'Alta',medium:'Media',low:'Baja'}[detailTracking.priority]) : 'Prioridad no informada o ambigua'}</span>
                  <small>{detailTracking?.blocked == null ? 'Bloqueo sin informar' : detailTracking.blocked ? 'Bloqueo declarado' : 'Sin bloqueo declarado'}</small>
                </div>

                <div className="drawer-meta-box">
                  <span className="meta-box-label">Fecha de Inicio</span>
                  <span className="meta-box-value">
                    {detail.start ? localDate(detail.start) : 'Sin inicio informado'}
                  </span>
                </div>

                <div className={'drawer-meta-box' + (detailTracking?.schedule === 'overdue' ? ' alert-highlight' : '')}>
                  <span className="meta-box-label">Vencimiento</span>
                  <span className="meta-box-value">
                    {detail.due ? localDate(detail.due) : 'Sin vencimiento informado'}
                  </span>
                  {detailTracking?.schedule === 'overdue' && (
                    <span className="meta-alert-tag">¡Vencida!</span>
                  )}
                </div>
              </div>

              {/* Data Quality Observations if any */}
              {(detailTracking?.qualityIssues ?? detail.qualityIssues).length > 0 && (
                <div className="drawer-section-card warning">
                  <div className="section-card-header">
                    <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <h4>Observaciones de Calidad de Datos</h4>
                  </div>
                  <ul className="drawer-issues-list">
                    {(detailTracking?.qualityIssues ?? detail.qualityIssues).map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Labels */}
              {detail.labelNames.length > 0 && (
                <div className="drawer-section-card">
                  <span className="drawer-section-label">Etiquetas</span>
                  <div className="labels-chip-row">
                    {detail.labelNames.map(label => (
                      <span key={label} className="label-chip">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklists */}
              {detail.planning?.checklists && detail.planning.checklists.length > 0 && (
                <div className="drawer-section-card">
                  <span className="drawer-section-label">Listas de Verificación</span>
                  <div className="checklists-container">
                    {detail.planning.checklists.map(checklist => {
                      const total = checklist.items.length;
                      const done = checklist.items.filter(i => i.completedDeclared).length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                      return (
                        <div key={checklist.id} className="checklist-card">
                          <div className="checklist-header">
                            <span className="checklist-title">{checklist.name}</span>
                            <span className="checklist-count">
                              {done}/{total} ({pct}%)
                            </span>
                          </div>
                          <div className="checklist-progress-bar">
                            <div className="checklist-progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <ul className="checklist-items-list">
                            {checklist.items.map(item => (
                              <li key={item.id} className={'checklist-item' + (item.completedDeclared ? ' is-done' : '')}>
                                <span className="checklist-check-icon">
                                  {item.completedDeclared ? (
                                    <Icon path="M20 6L9 17l-5-5" />
                                  ) : (
                                    <span className="empty-box-dot" />
                                  )}
                                </span>
                                <span className="checklist-item-text">{item.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Predecessors / Dependencies */}
              <div className="drawer-section-card">
                <span className="drawer-section-label">Predecesoras y Dependencias</span>
                {detail.planning?.dependencyDeclaration === 'none' ? (
                  <p className="drawer-empty-text">Ninguna dependencia declarada para esta actividad.</p>
                ) : detail.planning?.dependencies && detail.planning.dependencies.length > 0 ? (
                  <ul className="dependencies-list">
                    {detail.planning.dependencies.map((dep, idx) => (
                      <li key={idx} className="dependency-item">
                        <Icon path="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <div className="dep-info">
                          <strong>WBS {dep.wbs}</strong>
                          <small>
                            Relación: {dep.relation === 'finish_start' ? 'Fin a Inicio (FS)' : 'Inicio a Inicio (SS)'} · Desfase: {dep.lagHours}h
                          </small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="drawer-empty-text">Sin información de predecesoras informada en la fuente.</p>
                )}
              </div>

              {/* Scope & Declared Evidence */}
              <div className="drawer-section-card">
                <span className="drawer-section-label">Alcance y Evidencias Declaradas</span>
                <div className="description-card-box">
                  {detail.planning?.description ? (
                    <p className="source-description-text">{detail.planning.description}</p>
                  ) : (
                    <p className="drawer-empty-text">Sin descripción o alcance declarado en la tarjeta.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
        </div>
      )}
    </div>
  );
}
