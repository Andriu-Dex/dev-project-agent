import type {
  CodeCatalog,
  CodeOverview,
  CodeProposalView,
  ProjectAccess,
  ProposalState,
} from '@dev-project-agent/contracts';
import { Icon } from './Workspace';
import { Pagination } from './Pagination';
import type { Dispatch, SetStateAction } from 'react';
import { getStateConfig, dates, read, splitGoal } from './codeReviewShared';

export function CodeCorrectionsTab({
  action,
  authorizedCount,
  catalog,
  expandedGoals,
  filteredProposals,
  inProgressCount,
  overview,
  paginatedProposals,
  pendingHumanApprovalCount,
  prefix,
  project,
  proposalsPageSize,
  proposalsPurposeFilter,
  proposalsSearch,
  proposalsStatusFilter,
  rejectedCount,
  safeProposalsPage,
  selection,
  setCatalog,
  setDetail,
  setPaths,
  setProposalsPage,
  setProposalsPageSize,
  setProposalsPurposeFilter,
  setProposalsSearch,
  setProposalsStatusFilter,
  setSelection,
  setShowCatalog,
  toggleGoalExpand,
  totalProposals,
  totalProposalsPages,
}: {
  action: (operation: () => Promise<void>) => Promise<void>;
  authorizedCount: number;
  catalog: CodeCatalog | null;
  expandedGoals: Record<string, boolean>;
  filteredProposals: { id: string; version: number; purpose: "demonstration" | "live"; state: ProposalState; goal: string; createdAt: string; }[];
  inProgressCount: number;
  overview: CodeOverview | null;
  paginatedProposals: { id: string; version: number; purpose: "demonstration" | "live"; state: ProposalState; goal: string; createdAt: string; }[];
  pendingHumanApprovalCount: number;
  prefix: string;
  project: ProjectAccess;
  proposalsPageSize: number;
  proposalsPurposeFilter: string;
  proposalsSearch: string;
  proposalsStatusFilter: string;
  rejectedCount: number;
  safeProposalsPage: number;
  selection: { id: string; version: number; } | null;
  setCatalog: Dispatch<SetStateAction<CodeCatalog | null>>;
  setDetail: Dispatch<SetStateAction<CodeProposalView | null>>;
  setPaths: Dispatch<SetStateAction<string[]>>;
  setProposalsPage: Dispatch<SetStateAction<number>>;
  setProposalsPageSize: Dispatch<SetStateAction<number>>;
  setProposalsPurposeFilter: Dispatch<SetStateAction<string>>;
  setProposalsSearch: Dispatch<SetStateAction<string>>;
  setProposalsStatusFilter: Dispatch<SetStateAction<string>>;
  setSelection: Dispatch<SetStateAction<{ id: string; version: number; } | null>>;
  setShowCatalog: Dispatch<SetStateAction<boolean>>;
  toggleGoalExpand: (id: string) => void;
  totalProposals: number;
  totalProposalsPages: number;
}) {
  return (
    <>
      {/* Filter Panel matching proposals-filter-panel */}
      <section className="proposals-filter-panel">
        <div className="proposals-filter-tabs">
          <button
            type="button"
            className={'filter-pill-btn' + (proposalsStatusFilter === 'all' ? ' is-active' : '')}
            onClick={() => {
              setProposalsStatusFilter('all');
              setProposalsPage(1);
            }}
          >
            <span>Todas</span>
            <span className="pill-badge">{totalProposals}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (proposalsStatusFilter === 'waiting' ? ' is-active' : '')}
            onClick={() => {
              setProposalsStatusFilter('waiting');
              setProposalsPage(1);
            }}
          >
            <span>Esperando gestor</span>
            <span className={'pill-badge' + (pendingHumanApprovalCount > 0 ? ' red' : '')}>
              {pendingHumanApprovalCount}
            </span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (proposalsStatusFilter === 'in_progress' ? ' is-active' : '')}
            onClick={() => {
              setProposalsStatusFilter('in_progress');
              setProposalsPage(1);
            }}
          >
            <span>En proceso</span>
            <span className="pill-badge">{inProgressCount}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (proposalsStatusFilter === 'authorized' ? ' is-active' : '')}
            onClick={() => {
              setProposalsStatusFilter('authorized');
              setProposalsPage(1);
            }}
          >
            <span>Autorizadas</span>
            <span className="pill-badge">{authorizedCount}</span>
          </button>

          <button
            type="button"
            className={'filter-pill-btn' + (proposalsStatusFilter === 'rejected_or_changes' ? ' is-active' : '')}
            onClick={() => {
              setProposalsStatusFilter('rejected_or_changes');
              setProposalsPage(1);
            }}
          >
            <span>Ajustes / Rechazadas</span>
            <span className="pill-badge">{rejectedCount}</span>
          </button>
        </div>

        <div className="proposals-secondary-controls">
          <div className="proposals-search-box">
            <Icon path="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
            <input
              type="search"
              placeholder="Buscar por ID u objetivo..."
              value={proposalsSearch}
              onChange={event => {
                setProposalsSearch(event.target.value);
                setProposalsPage(1);
              }}
              aria-label="Buscar corrección"
            />
            {proposalsSearch && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setProposalsSearch('');
                  setProposalsPage(1);
                }}
                aria-label="Limpiar búsqueda"
              >
                <Icon path="M18 6L6 18 M6 6l12 12" />
              </button>
            )}
          </div>

          <select
            id="code-proposals-purpose-filter"
            value={proposalsPurposeFilter}
            onChange={event => {
              setProposalsPurposeFilter(event.target.value);
              setProposalsPage(1);
            }}
            className="proposals-select"
            aria-label="Filtrar por propósito"
          >
            <option value="all">Todos los propósitos</option>
            <option value="live">Solo Uso real (PR)</option>
            <option value="demonstration">Solo Demostración</option>
          </select>
        </div>
      </section>

      {/* Proposals List Container matching proposals-list-container */}
      <section className="proposals-list-container">
        <div className="proposals-list-header">
          <span className="proposals-list-count">
            Mostrando <strong>{filteredProposals.length}</strong>{' '}
            {filteredProposals.length === 1 ? 'corrección' : 'correcciones'}
            {filteredProposals.length !== totalProposals ? ` (filtradas de ${totalProposals})` : ''}
          </span>
        </div>

        {!overview ? (
          <div className="proposals-empty-state">
            <div className="empty-icon-shield">
              <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </div>
            <h3>Consultando correcciones…</h3>
            <p>Cargando información del proyecto y del proveedor de IA.</p>
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="proposals-empty-state">
            <div className="empty-icon-shield">
              <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </div>
            <h3>No se encontraron correcciones</h3>
            <p>
              {totalProposals === 0
                ? 'Aún no se han preparado correcciones de código para este proyecto. Puedes abrir un análisis y solicitar una corrección.'
                : 'No hay correcciones que coincidan con los filtros aplicados actualmente.'}
            </p>
            {project.canManageProject && (
              <button
                type="button"
                className="proposals-reset-filters-btn"
                onClick={() => {
                  setShowCatalog(true);
                  if (!catalog) {
                    void action(async () => {
                      const value = await read<CodeCatalog>(prefix + '/catalog');
                      setCatalog(value);
                      setPaths([]);
                    });
                  }
                }}
              >
                Examinar catálogo de GitHub
              </button>
            )}
          </div>
        ) : (
          <div className="proposals-cards-list">
            {paginatedProposals.map(item => {
              const conf = getStateConfig(item.state);
              const isSelected = selection?.id === item.id;
              return (
                <article
                  key={item.id}
                  className={'proposal-item-card' + (isSelected ? ' is-selected' : '')}
                  onClick={() => {
                    setSelection({ id: item.id, version: item.version });
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
                        <span className="proposal-version-chip">v{item.version}</span>
                        <span
                          className={
                            'proposal-purpose-chip ' +
                            (item.purpose === 'live' ? 'live' : 'demonstration')
                          }
                        >
                          {item.purpose === 'live' ? 'Uso real' : 'Demostración'}
                        </span>
                      </div>

                      {(() => {
                        const { title, description } = splitGoal(item.goal);
                        const isGoalExpanded = !!expandedGoals[item.id];
                        return (
                          <>
                            <h4 className="proposal-card-title">{title}</h4>
                            {description && (
                              <div className="proposal-desc-container">
                                <p
                                  className={
                                    'proposal-card-description' +
                                    (isGoalExpanded ? ' is-expanded' : ' is-clamped')
                                  }
                                >
                                  {description}
                                </p>
                                {description.length > 70 && (
                                  <button
                                    type="button"
                                    className="proposal-expand-toggle-btn"
                                    onClick={e => {
                                      e.stopPropagation();
                                      toggleGoalExpand(item.id);
                                    }}
                                  >
                                    <span>
                                      {isGoalExpanded ? 'Mostrar menos' : 'Ver descripción completa'}
                                    </span>
                                    <Icon path={isGoalExpanded ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="proposal-card-meta-line">
                              ID: <code>{item.id.slice(0, 8)}</code> · Creada el {dates(item.createdAt)}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="proposal-action-arrow">
                    <button
                      type="button"
                      className="proposal-detail-trigger-btn"
                      onClick={e => {
                        e.stopPropagation();
                        setSelection({ id: item.id, version: item.version });
                        setDetail(null);
                      }}
                      aria-expanded={isSelected}
                      title="Ver detalle del diff, dictámenes y decisiones"
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

        {/* Pagination matching planning-pagination-bar */}
        {filteredProposals.length > 0 && (
          <Pagination
            page={safeProposalsPage}
            totalPages={totalProposalsPages}
            totalItems={filteredProposals.length}
            pageSize={proposalsPageSize}
            pageSizeOptions={[5, 10, 20]}
            sizeSelectId="code-proposals-page-size"
            sizeSelectLabel="Cantidad de correcciones por página"
            onPageChange={setProposalsPage}
            onPageSizeChange={size => { setProposalsPageSize(size); setProposalsPage(1); }}
          />
        )}
      </section>
    </>
  );
}
