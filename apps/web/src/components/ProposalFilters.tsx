import type {
  ProposalState,
} from '@dev-project-agent/contracts';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';

export function ProposalFilters({
  allProposals,
  inReviewCount,
  pendingHumanApprovalCount,
  purposeFilter,
  search,
  setPurposeFilter,
  setSearch,
  setStatusFilter,
  statusFilter,
  totalCount,
}: {
  allProposals: { id: string; version: number; purpose: "demonstration" | "live"; state: ProposalState; goal: string; cardName: string; createdAt: string; }[];
  inReviewCount: number;
  pendingHumanApprovalCount: number;
  purposeFilter: string;
  search: string;
  setPurposeFilter: Dispatch<SetStateAction<string>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  totalCount: number;
}) {
  return (
    <section className="proposals-filter-panel">
      <div className="proposals-filter-tabs">
        <button
          type="button"
          className={'filter-pill-btn' + (statusFilter === 'all' ? ' is-active' : '')}
          onClick={() => setStatusFilter('all')}
        >
          <span>Todas</span>
          <span className="pill-badge">{totalCount}</span>
        </button>
        <button
          type="button"
          className={'filter-pill-btn' + (statusFilter === 'pending_approval' ? ' is-active' : '')}
          onClick={() => setStatusFilter('pending_approval')}
        >
          <span>Esperando gestor</span>
          <span className={'pill-badge' + (pendingHumanApprovalCount > 0 ? ' red' : '')}>
            {pendingHumanApprovalCount}
          </span>
        </button>
        <button
          type="button"
          className={'filter-pill-btn' + (statusFilter === 'in_process' ? ' is-active' : '')}
          onClick={() => setStatusFilter('in_process')}
        >
          <span>En proceso</span>
          <span className="pill-badge purple">{inReviewCount}</span>
        </button>
        <button
          type="button"
          className={'filter-pill-btn' + (statusFilter === 'authorized' ? ' is-active' : '')}
          onClick={() => setStatusFilter('authorized')}
        >
          <span>Autorizadas</span>
          <span className="pill-badge blue">
            {allProposals.filter(p => p.state === 'authorized').length}
          </span>
        </button>
        <button
          type="button"
          className={'filter-pill-btn' + (statusFilter === 'executed' ? ' is-active' : '')}
          onClick={() => setStatusFilter('executed')}
        >
          <span>Ejecutadas</span>
          <span className="pill-badge green">
            {allProposals.filter(p => p.state === 'executed').length}
          </span>
        </button>
        <button
          type="button"
          className={'filter-pill-btn' + (statusFilter === 'changes_or_rejected' ? ' is-active' : '')}
          onClick={() => setStatusFilter('changes_or_rejected')}
        >
          <span>Ajustes / Rechazadas</span>
          <span className="pill-badge">
            {allProposals.filter(p => ['changes_requested', 'rejected', 'invalidated'].includes(p.state)).length}
          </span>
        </button>
      </div>

      <div className="proposals-secondary-controls">
        <div className="proposals-search-box">
          <Icon path="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
          <input
            type="search"
            placeholder="Buscar por tarjeta u objetivo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Buscar propuestas"
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
          value={purposeFilter}
          onChange={e => setPurposeFilter(e.target.value)}
          className="proposals-select"
          aria-label="Filtrar por propósito"
        >
          <option value="all">Todos los propósitos</option>
          <option value="live">Solo Uso real (Trello)</option>
          <option value="demonstration">Solo Demostración</option>
        </select>
      </div>
    </section>
  );
}
