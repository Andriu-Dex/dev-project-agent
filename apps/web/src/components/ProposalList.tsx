import type {
  ProposalState,
} from '@dev-project-agent/contracts';
import { Icon } from './Workspace';
import { Pagination } from './Pagination';
import type { Dispatch, SetStateAction } from 'react';
import { getStateConfig } from './proposalShared';

export function ProposalList({
  pageSize,
  paginatedProposals,
  safePage,
  selection,
  setConsent,
  setCurrentPage,
  setFamilyFilter,
  setPageSize,
  setPurposeFilter,
  setSearch,
  setSelection,
  setStatusFilter,
  totalCount,
  totalPages,
  visibleProposals,
}: {
  pageSize: number;
  paginatedProposals: { id: string; version: number; purpose: "demonstration" | "live"; state: ProposalState; goal: string; cardName: string; createdAt: string; }[];
  safePage: number;
  selection: { id: string; version: number; } | null;
  setConsent: Dispatch<SetStateAction<boolean>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setFamilyFilter: Dispatch<SetStateAction<string>>;
  setPageSize: Dispatch<SetStateAction<number>>;
  setPurposeFilter: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setSelection: Dispatch<SetStateAction<{ id: string; version: number; } | null>>;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  totalCount: number;
  totalPages: number;
  visibleProposals: { id: string; version: number; purpose: "demonstration" | "live"; state: ProposalState; goal: string; cardName: string; createdAt: string; }[];
}) {
  return (
    <section className="proposals-list-container">
      <div className="proposals-list-header">
        <span className="proposals-list-count">
          Mostrando <strong>{visibleProposals.length}</strong>{' '}
          {visibleProposals.length === 1 ? 'propuesta' : 'propuestas'}
          {visibleProposals.length !== totalCount ? ` (filtradas de ${totalCount})` : ''}
        </span>
      </div>

      {visibleProposals.length === 0 ? (
        <div className="proposals-empty-state">
          <div className="empty-icon-shield">
            <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          </div>
          <h3>No se encontraron propuestas</h3>
          <p>
            {totalCount === 0
              ? 'Aún no se han preparado propuestas de cambio para este proyecto. Puedes formular una nueva propuesta arriba.'
              : 'No hay propuestas que coincidan con los filtros aplicados actualmente.'}
          </p>
          {totalCount > 0 && (
            <button
              type="button"
              className="proposals-reset-filters-btn"
              onClick={() => {
                setStatusFilter('all');
                setPurposeFilter('all');
                setFamilyFilter('all');
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
          <div className="proposals-cards-list">
            {paginatedProposals.map(proposal => {
              const stConfig = getStateConfig(proposal.state);
              const isSelected = selection?.id === proposal.id;

              return (
                <article
                  key={proposal.id}
                  className={'proposal-item-card' + (isSelected ? ' is-selected' : '')}
                  onClick={() => {
                    setSelection({ id: proposal.id, version: proposal.version });
                    setConsent(false);
                  }}
                >
                  <div className="proposal-card-left">
                    <div className={'proposal-status-bubble ' + stConfig.badgeClass}>
                      <Icon path={stConfig.icon} />
                    </div>

                    <div className="proposal-content-area">
                      <div className="proposal-meta-top">
                        <span className={'proposal-status-badge ' + stConfig.badgeClass}>
                          {stConfig.label}
                        </span>
                        <span className="proposal-version-chip">v{proposal.version}</span>
                        <span
                          className={
                            'proposal-purpose-chip ' +
                            (proposal.purpose === 'live' ? 'live' : 'demonstration')
                          }
                        >
                          {proposal.purpose === 'live' ? 'Uso real' : 'Demostración'}
                        </span>
                      </div>

                      <h4 className="proposal-card-title">{proposal.cardName}</h4>
                      <p className="proposal-card-goal">{proposal.goal}</p>
                    </div>
                  </div>

                  <div className="proposal-action-arrow">
                    <button
                      type="button"
                      className="proposal-detail-trigger-btn"
                      onClick={e => {
                        e.stopPropagation();
                        setSelection({ id: proposal.id, version: proposal.version });
                        setConsent(false);
                      }}
                      aria-expanded={isSelected}
                      title="Ver detalle del cambio, dictámenes de agentes y decisiones"
                    >
                      <span>Examinar</span>
                      <Icon path="M9 5l7 7-7 7" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleProposals.length > 0 && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              totalItems={visibleProposals.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50]}
              sizeSelectId="proposals-page-size"
              sizeSelectLabel="Cantidad de propuestas por página"
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </>
      )}
    </section>
  );
}
