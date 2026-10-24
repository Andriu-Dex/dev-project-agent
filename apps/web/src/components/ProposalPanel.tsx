import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectAccess,
  ProposalOverview,
  ProposalVersionView,
  ProviderOverview,
  ReasoningEffort,
  SupervisionOverview,
  TrelloOverview,
  TrackingPolicyResponse,
} from '@dev-project-agent/contracts';
import { readAgentProviders } from './agentProviders';
import { Icon } from './Workspace';
import { read } from './proposalShared';
import { ProposalEditor } from './ProposalEditor';
import { ProposalFilters } from './ProposalFilters';
import { ProposalList } from './ProposalList';
import { ProposalDrawer } from './ProposalDrawer';

export function ProposalPanel({
  project,
  csrfToken,
  sourceRevision,
}: {
  project: ProjectAccess;
  csrfToken: string;
  sourceRevision: number;
}) {
  const prefix = `/api/v1/projects/${project.id}`;
  const [overview, setOverview] = useState<ProposalOverview | null>(null);
  const [provider, setProvider] = useState<ProviderOverview | null>(null);
  const [sources, setSources] = useState<{ trello: TrelloOverview; supervision: SupervisionOverview } | null>(null);
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const [detail, setDetail] = useState<ProposalVersionView | null>(null);

  // Form states
  const [showEditor, setShowEditor] = useState(false);
  const [purpose, setPurpose] = useState<'demonstration' | 'live'>('demonstration');
  const [family, setFamily] = useState('due');
  const [start, setStart] = useState('');
  const [label, setLabel] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [policy, setPolicy] = useState<TrackingPolicyResponse | null>(null);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState<ReasoningEffort | ''>('');
  const [cardId, setCardId] = useState('');
  const [goal, setGoal] = useState('');
  const [due, setDue] = useState('');
  const [adjustment, setAdjustment] = useState<{ id: string; version: number } | null>(null);
  const [resumeConsent, setResumeConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  // Filtering & Pagination
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [purposeFilter, setPurposeFilter] = useState<string>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const request = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void read<TrackingPolicyResponse>(prefix + '/tracking-policy', controller.signal)
      .then(setPolicy)
      .catch(() => {});
    return () => controller.abort();
  }, [prefix, sourceRevision]);

  // Load suggestion from session storage if redirected from Alerts / Planning
  useEffect(() => {
    const key = 'proposal-suggestion:' + project.id;
    const stored = sessionStorage.getItem(key);
    if (!stored) return;
    sessionStorage.removeItem(key);
    try {
      const value = JSON.parse(stored);
      if (typeof value.cardId === 'string' && typeof value.goal === 'string') {
        setCardId(value.cardId);
        setGoal(value.goal.slice(0, 4000));
        if (['due', 'dates', 'members', 'priority', 'state'].includes(value.family)) {
          setFamily(value.family);
        }
        setShowEditor(true);
      }
    } catch {
      // Ignore invalid local drafts
    }
  }, [project.id]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const [next, connection, trello, supervision] = await Promise.all([
        read<ProposalOverview>(prefix + '/proposals', signal),
        readAgentProviders(prefix, signal),
        read<TrelloOverview>(prefix + '/trello', signal),
        read<SupervisionOverview>(prefix + '/supervision', signal),
      ]);
      if (signal.aborted) return;
      setOverview(next);
      setProvider(connection);
      setSources({ trello, supervision });
      setLoadError('');
      setModel(previous =>
        connection.connection.models.some(value => value.slug === previous)
          ? previous
          : connection.connection.models[0]?.slug ?? ''
      );
      const cards = trello.latest?.data.items.filter(item => !item.archived && item.kind !== 'reference') ?? [];
      setCardId(previous => (cards.some(item => item.id === previous) ? previous : cards[0]?.id ?? ''));
    },
    [prefix]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setLoadError('No se pudo actualizar el panel. Consulta de nuevo.');
    });
    return () => controller.abort();
  }, [load, revision, sourceRevision]);

  const active = overview?.jobs.some(job => job.status === 'running') ?? false;

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const timer = setInterval(() => {
      if (loading) return;
      loading = true;
      void load(controller.signal)
        .then(() => setRevision(value => value + 1))
        .catch(() => {
          if (!controller.signal.aborted) setLoadError('No se pudo actualizar el panel. Consulta de nuevo.');
        })
        .finally(() => {
          loading = false;
        });
    }, active ? 2500 : 15000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [load, active]);

  useEffect(() => {
    setDetail(null);
    setConfirm(false);
    setReason('');
    setResumeConsent(false);
    setAdjustment(null);
  }, [selection?.id, selection?.version]);

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    void read<ProposalVersionView>(
      `${prefix}/proposals/${selection.id}/versions/${selection.version}`,
      controller.signal
    )
      .then(value => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError('No se pudo leer la versión seleccionada.');
      });
    return () => controller.abort();
  }, [prefix, selection?.id, selection?.version, revision]);

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, purposeFilter, familyFilter, search, pageSize]);

  const selectedModel = provider?.connection.models.find(value => value.slug === model);
  useEffect(() => {
    if (effort && !selectedModel?.reasoningEfforts?.includes(effort)) setEffort('');
  }, [effort, selectedModel]);

  const latest = overview?.proposals.find(proposal => proposal.id === selection?.id);
  const isLatest = detail?.version === latest?.version;
  const canAdjust = Boolean(detail && isLatest && ['changes_requested', 'invalidated'].includes(detail.state));
  const adjusting = Boolean(
    canAdjust && adjustment?.id === detail?.proposalId && adjustment?.version === detail?.version
  );

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selection && !adjusting) {
        setSelection(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, adjusting]);
  const selectedCard = sources?.trello.latest?.data.items.find(item => item.id === cardId);
  const isDate = family === 'due' || family === 'dates';
  const effectiveStart = family === 'dates' ? start : selectedCard?.start;
  const dateProblem =
    isDate && due
      ? new Date(due).getTime() <= Date.now()
        ? 'Selecciona una fecha futura.'
        : effectiveStart && new Date(due).getTime() < new Date(effectiveStart).getTime()
          ? 'La nueva fecha no puede ser anterior al inicio registrado.'
          : ''
      : '';
  const connected = provider?.connection.status === 'connected';

  async function mutate(
    path: string,
    body: Record<string, unknown> | null,
    onSuccess?: (result: { proposalId?: string; version?: number; invalidated?: boolean }) => void
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const signature = JSON.stringify({ path, body });
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch(prefix + path, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify({ ...body, requestKey: request.current.key }) } : {}),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? 'No se pudo confirmar la operación.');
        return;
      }
      request.current = null;
      onSuccess?.(result);
      setRevision(value => value + 1);
    } catch {
      setError('No se pudo confirmar la solicitud. Actualiza el panel antes de intentar de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function prepare() {
    if (!sources?.supervision.latestRun || !consent || (isDate && !due)) return;
    if (dateProblem) {
      setError(dateProblem);
      return;
    }
    const target = new Date(due);
    if (isDate && !Number.isFinite(target.getTime())) {
      setError('Selecciona una fecha válida.');
      return;
    }
    if (family === 'dates' && !Number.isFinite(new Date(start).getTime())) {
      setError('Selecciona un inicio válido.');
      return;
    }
    const change =
      family === 'due'
        ? { requestedDue: target.toISOString() }
        : {
            requestedChange:
              family === 'dates'
                ? { family, start: new Date(start).toISOString(), due: target.toISOString() }
                : family === 'members'
                  ? { family, memberIds }
                  : { family, label },
          };
    await mutate(
      '/proposals',
      {
        ...(!adjusting ? { purpose } : {}),
        sourceRunId: sources.supervision.latestRun.id,
        cardId,
        ...change,
        goal,
        model,
        ...(effort ? { reasoningEffort: effort } : {}),
        ...(adjusting ? { proposalId: detail!.proposalId, expectedVersion: detail!.version } : {}),
      },
      result => {
        if (result.proposalId && result.version) {
          setSelection({ id: result.proposalId, version: result.version });
        }
        setConsent(false);
        setShowEditor(false);
        setNotice('Proceso iniciado con éxito. Cada agente trabajará en secuencia.');
      }
    );
  }

  function decide(decision: 'approved' | 'rejected' | 'changes_requested') {
    if (!detail || !detail.contentHash) return;
    void mutate(
      `/proposals/${detail.proposalId}/versions/${detail.version}/decisions`,
      { contentHash: detail.contentHash, decision, reason },
      result =>
        setNotice(
          result.invalidated
            ? 'La propuesta quedó invalidada por cambios en la fuente. Actualiza las fuentes y prepara una nueva versión.'
            : decision === 'approved'
              ? detail.purpose === 'demonstration'
                ? 'Aprobación de demostración registrada. Esta propuesta no puede modificar Trello.'
                : 'Autorización registrada. Todavía no se ejecutan cambios en Trello.'
              : 'Decisión registrada correctamente.'
        )
    );
  }

  const detailPath = detail ? `/proposals/${detail.proposalId}/versions/${detail.version}` : '';
  const cards = sources?.trello.latest?.data.items.filter(item => !item.archived && item.kind !== 'reference') ?? [];

  // Metrics
  const allProposals = overview?.proposals ?? [];
  const totalCount = allProposals.length;
  const pendingHumanApprovalCount = allProposals.filter(p => p.state === 'pending_human_approval').length;
  const inReviewCount = allProposals.filter(p =>
    ['draft', 'pending_review', 'in_review', 'pending_policy_check', 'in_policy_check'].includes(p.state)
  ).length;
  const authorizedCount = allProposals.filter(p => ['authorized', 'executed', 'executing'].includes(p.state)).length;

  // Filtered proposals
  const visibleProposals = allProposals.filter(proposal => {
    // Status tab filter
    if (statusFilter === 'pending_approval' && proposal.state !== 'pending_human_approval') return false;
    if (
      statusFilter === 'in_process' &&
      !['draft', 'pending_review', 'in_review', 'pending_policy_check', 'in_policy_check'].includes(proposal.state)
    )
      return false;
    if (statusFilter === 'authorized' && proposal.state !== 'authorized') return false;
    if (statusFilter === 'executed' && proposal.state !== 'executed') return false;
    if (
      statusFilter === 'changes_or_rejected' &&
      !['changes_requested', 'rejected', 'invalidated'].includes(proposal.state)
    )
      return false;

    // Purpose filter
    if (purposeFilter !== 'all' && proposal.purpose !== purposeFilter) return false;

    // Search query
    const q = search.trim().toLowerCase();
    if (q) {
      const cardName = (proposal.cardName ?? '').toLowerCase();
      const pGoal = (proposal.goal ?? '').toLowerCase();
      if (!cardName.includes(q) && !pGoal.includes(q)) return false;
    }

    return true;
  });

  // Pagination
  const totalProposalsCount = visibleProposals.length;
  const totalPages = Math.max(1, Math.ceil(totalProposalsCount / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalProposalsCount === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalProposalsCount);
  const paginatedProposals = visibleProposals.slice(startIndex, endIndex);

  return (
    <div className="proposals-dashboard">
      {/* Top Banner / Hero Context */}
      <section className="proposals-hero-banner">
        <div className="proposals-hero-main">
          <div className="proposals-live-badge">
            <span className="live-pulse-dot" />
            <span>ORQUESTACIÓN SECUENCIAL · 3 AGENTES IA</span>
          </div>
          <h2 className="proposals-hero-title">Centro de Propuestas y Decisiones de Cambio</h2>
          <p className="proposals-hero-subtitle">
            Los agentes <strong>Ejecutor</strong>, <strong>Revisor</strong> y <strong>Aprobador</strong> colaboran en
            secuencia para formular y verificar cada ajuste sobre Trello. Toda modificación real requiere autorización
            humana obligatoria.
          </p>
        </div>

        <div className="proposals-hero-actions">
          <button
            type="button"
            className="proposals-refresh-btn"
            disabled={busy}
            onClick={() => {
              setError('');
              setRevision(value => value + 1);
            }}
            title="Actualizar listado de propuestas"
          >
            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            <span>Actualizar propuestas</span>
          </button>

          {project.canManageProject && (
            <button
              type="button"
              className="proposals-new-btn"
              onClick={() => {
                setShowEditor(v => !v);
                setAdjustment(null);
              }}
            >
              <Icon path={showEditor ? 'M18 6L6 18 M6 6l12 12' : 'M12 5v14 M5 12h14'} />
              <span>{showEditor ? 'Cerrar editor' : 'Nueva propuesta'}</span>
            </button>
          )}
        </div>
      </section>

      {/* Global Alerts / Notices */}
      {(error || loadError) && (
        <div role="alert" className="proposals-error-banner">
          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <span>{error || loadError}</span>
        </div>
      )}

      {notice && (
        <div role="status" className="proposals-success-banner">
          <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          <span>{notice}</span>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="proposals-kpi-grid">
        <div className="proposals-kpi-card">
          <div className="kpi-icon-box total">
            <Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Total Propuestas</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{totalCount}</strong>
              <span className="kpi-subtext">registradas en el proyecto</span>
            </div>
          </div>
        </div>

        <div className={'proposals-kpi-card' + (pendingHumanApprovalCount > 0 ? ' has-danger' : '')}>
          <div className="kpi-icon-box danger">
            <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Esperando al Gestor</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{pendingHumanApprovalCount}</strong>
              <span className="kpi-subtext">
                {pendingHumanApprovalCount > 0 ? 'Requieren tu decisión' : 'Ninguna pendiente'}
              </span>
            </div>
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box progress">
            <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">En Revisión por Agentes</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{inReviewCount}</strong>
              <span className="kpi-subtext">procesadas en secuencia</span>
            </div>
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box success">
            <Icon path="M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Autorizadas / Ejecutadas</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{authorizedCount}</strong>
              <span className="kpi-subtext">validadas por el gestor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Proposal Editor / Form Card */}
      {project.canManageProject && (showEditor || adjusting) && (
        <ProposalEditor
          active={active}
          adjusting={adjusting}
          busy={busy}
          cardId={cardId}
          cards={cards}
          connected={connected}
          consent={consent}
          dateProblem={dateProblem}
          detail={detail}
          due={due}
          effort={effort}
          family={family}
          goal={goal}
          isDate={isDate}
          label={label}
          memberIds={memberIds}
          model={model}
          policy={policy}
          prepare={prepare}
          provider={provider}
          purpose={purpose}
          selectedCard={selectedCard}
          selectedModel={selectedModel}
          setAdjustment={setAdjustment}
          setCardId={setCardId}
          setConsent={setConsent}
          setDue={setDue}
          setEffort={setEffort}
          setFamily={setFamily}
          setGoal={setGoal}
          setLabel={setLabel}
          setMemberIds={setMemberIds}
          setModel={setModel}
          setPurpose={setPurpose}
          setShowEditor={setShowEditor}
          setStart={setStart}
          sources={sources}
          start={start}
        />
      )}

      {/* Modern Filter Panel */}
      <ProposalFilters
        allProposals={allProposals}
        inReviewCount={inReviewCount}
        pendingHumanApprovalCount={pendingHumanApprovalCount}
        purposeFilter={purposeFilter}
        search={search}
        setPurposeFilter={setPurposeFilter}
        setSearch={setSearch}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
        totalCount={totalCount}
      />

      {/* Proposals List Container */}
      <ProposalList
        pageSize={pageSize}
        paginatedProposals={paginatedProposals}
        safePage={safePage}
        selection={selection}
        setConsent={setConsent}
        setCurrentPage={setCurrentPage}
        setFamilyFilter={setFamilyFilter}
        setPageSize={setPageSize}
        setPurposeFilter={setPurposeFilter}
        setSearch={setSearch}
        setSelection={setSelection}
        setStatusFilter={setStatusFilter}
        totalCount={totalCount}
        totalPages={totalPages}
        visibleProposals={visibleProposals}
      />

      {/* Slide-over Detail Drawer */}
      {/* The drawer stays selected but hidden while adjusting, so the new version keeps its proposal lineage. */}
      {detail && !adjusting && (
        <ProposalDrawer
          active={active}
          busy={busy}
          canAdjust={canAdjust}
          confirm={confirm}
          connected={connected}
          csrfToken={csrfToken}
          decide={decide}
          detail={detail}
          detailPath={detailPath}
          effort={effort}
          isLatest={isLatest}
          latest={latest}
          model={model}
          mutate={mutate}
          overview={overview}
          project={project}
          reason={reason}
          resumeConsent={resumeConsent}
          setAdjustment={setAdjustment}
          setCardId={setCardId}
          setConfirm={setConfirm}
          setConsent={setConsent}
          setDue={setDue}
          setFamily={setFamily}
          setGoal={setGoal}
          setLabel={setLabel}
          setMemberIds={setMemberIds}
          setNotice={setNotice}
          setReason={setReason}
          setResumeConsent={setResumeConsent}
          setRevision={setRevision}
          setSelection={setSelection}
          setShowEditor={setShowEditor}
          setStart={setStart}
          sources={sources}
        />
      )}
    </div>
  );
}
