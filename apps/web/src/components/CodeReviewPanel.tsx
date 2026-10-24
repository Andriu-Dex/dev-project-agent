import { RepositoryCoverage } from './RepositoryCoverage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CodeAnalysisView,
  CodeCatalog,
  CodeOverview,
  CodeProposalView,
  ProjectAccess,
  ProviderOverview,
  ReasoningEffort,
} from '@dev-project-agent/contracts';
import { readAgentProviders } from './agentProviders';
import { Icon } from './Workspace';
import { read } from './codeReviewShared';
import { CodeCatalogCard } from './CodeCatalogCard';
import { CodeCorrectionsTab } from './CodeCorrectionsTab';
import { CodeAnalysesTab } from './CodeAnalysesTab';
import { CodePublicationsTab } from './CodePublicationsTab';
import { CodeProposalDrawer } from './CodeProposalDrawer';

export function CodeReviewPanel({
  project,
  csrfToken,
}: {
  project: ProjectAccess;
  csrfToken: string;
}) {
  const prefix = `/api/v1/projects/${project.id}/code-review`;

  // Main data states
  const [overview, setOverview] = useState<CodeOverview | null>(null);
  const [catalog, setCatalog] = useState<CodeCatalog | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'proposals' | 'analyses' | 'coverage' | 'publications'>('proposals');

  // Catalog & file selection states
  const [showCatalog, setShowCatalog] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'files' | 'comparison'>('files');
  const [baseSha, setBaseSha] = useState('');
  const [withAi, setWithAi] = useState(false);

  // Analysis detail states
  const [analysisId, setAnalysisId] = useState('');
  const [analysis, setAnalysis] = useState<CodeAnalysisView | null>(null);
  const [findingIds, setFindingIds] = useState<string[]>([]);
  const [goal, setGoal] = useState('');

  // Proposal selection and detail modal/drawer
  const [selection, setSelection] = useState<{ id: string; version: number } | null>(null);
  const [detail, setDetail] = useState<CodeProposalView | null>(null);
  // Hiding the drawer keeps the selected version, which a follow-up version needs as its base.
  const [drawerHidden, setDrawerHidden] = useState(false);

  // Provider & AI settings
  const [provider, setProvider] = useState<ProviderOverview | null>(null);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState<ReasoningEffort | ''>('');
  const [consent, setConsent] = useState(false);
  const [purpose, setPurpose] = useState<'demonstration' | 'live'>('demonstration');

  // Manager action states
  const [reason, setReason] = useState('');
  const [confirmDecision, setConfirmDecision] = useState(false);
  const [confirmSimulation, setConfirmSimulation] = useState(false);
  const [confirmPublication, setConfirmPublication] = useState(false);

  // Filtering & Pagination for proposals
  const [proposalsSearch, setProposalsSearch] = useState('');
  const [proposalsStatusFilter, setProposalsStatusFilter] = useState('all');
  const [proposalsPurposeFilter, setProposalsPurposeFilter] = useState('all');
  const [proposalsPage, setProposalsPage] = useState(1);
  const [proposalsPageSize, setProposalsPageSize] = useState(10);
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  const toggleGoalExpand = (id: string) => {
    setExpandedGoals(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Pagination for analyses
  const [analysesPage, setAnalysesPage] = useState(1);
  const [analysesPageSize, setAnalysesPageSize] = useState(10);

  // Pagination for publications
  const [pubsPage, setPubsPage] = useState(1);
  const [pubsPageSize, setPubsPageSize] = useState(10);

  const keys = useRef(new Map<string, string>());

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const data = await read<CodeOverview>(prefix, signal ? { signal } : {});
      if (signal?.aborted) return;
      setOverview(data);

      if (project.canManageProject) {
        const connection = await readAgentProviders(`/api/v1/projects/${project.id}`, signal);
        if (signal?.aborted) return;
        setProvider(connection);
        setModel(previous =>
          connection.connection.models.some(item => item.slug === previous)
            ? previous
            : connection.connection.models[0]?.slug ?? ''
        );
      }
    },
    [prefix, project.canManageProject, project.id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setError('No se pudo cargar la revisión de código. Actualiza el panel.');
      }
    });
    return () => controller.abort();
  }, [refresh]);

  const running =
    overview?.analyses.some(item => item.status === 'running') ||
    overview?.jobs.some(item => item.status === 'running') ||
    overview?.publications.some(item => ['queued', 'running'].includes(item.status));

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const timer = setInterval(() => {
      if (loading) return;
      loading = true;
      void refresh(controller.signal)
        .catch(() => {
          if (!controller.signal.aborted) {
            setError('No se pudo actualizar la revisión. Consulta el estado antes de reintentar.');
          }
        })
        .finally(() => {
          loading = false;
        });
    }, running ? 2500 : 15000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [refresh, running]);

  useEffect(() => {
    const controller = new AbortController();
    if (!analysisId) {
      setAnalysis(null);
      return;
    }
    void read<CodeAnalysisView>(prefix + '/analyses/' + analysisId, { signal: controller.signal })
      .then(value => {
        if (!controller.signal.aborted) setAnalysis(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('No se pudo abrir el análisis de código.');
      });
    return () => controller.abort();
  }, [prefix, analysisId, overview]);

  useEffect(() => {
    setFindingIds([]);
    setConsent(false);
  }, [analysisId]);

  useEffect(() => setDrawerHidden(false), [selection]);

  useEffect(() => {
    const controller = new AbortController();
    if (!selection) {
      setDetail(null);
      return;
    }
    void read<CodeProposalView>(`${prefix}/proposals/${selection.id}/versions/${selection.version}`, {
      signal: controller.signal,
    })
      .then(value => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('No se pudo abrir la versión de la corrección.');
      });
    return () => controller.abort();
  }, [prefix, selection, overview]);

  useEffect(() => {
    setConfirmDecision(false);
    setConfirmSimulation(false);
    setConfirmPublication(false);
    setReason('');
  }, [selection]);

  const selectedModel = provider?.connection.models.find(item => item.slug === model);
  const connected = provider?.connection.status === 'connected';

  useEffect(() => {
    if (effort && !selectedModel?.reasoningEfforts?.includes(effort)) {
      setEffort('');
    }
    setConsent(false);
  }, [model, selectedModel?.reasoningEfforts?.join(','), effort]);

  // Close drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (detail && !drawerHidden) setSelection(null);
        else if (analysis) setAnalysisId('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detail, drawerHidden, analysis]);

  async function action(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      await refresh();
    } catch (failure) {
      setError(
        failure instanceof TypeError
          ? 'No se pudo confirmar la solicitud. Actualiza el historial antes de volver a intentar.'
          : failure instanceof Error
            ? failure.message
            : 'No se pudo completar la solicitud.'
      );
      void refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function post<T>(path: string, body: Record<string, unknown>, idempotent = true) {
    const signature = JSON.stringify({ path, body });
    if (idempotent && !keys.current.has(signature)) {
      keys.current.set(signature, crypto.randomUUID());
    }
    const result = await read<T>(prefix + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({
        ...body,
        ...(idempotent ? { requestKey: keys.current.get(signature) } : {}),
      }),
    });
    keys.current.delete(signature);
    return result;
  }

  const providerFields = { model, ...(effort ? { reasoningEffort: effort } : {}), consent };
  const versionPath = detail ? `/proposals/${detail.id}/versions/${detail.version}` : '';
  const current =
    detail &&
    selection &&
    detail.id === selection.id &&
    detail.version === selection.version &&
    detail.version === detail.latestVersion;
  const canPrepare =
    project.canManageProject &&
    !busy &&
    !running &&
    connected &&
    consent &&
    !!model &&
    !!goal.trim() &&
    findingIds.length > 0 &&
    analysis?.status === 'ready';

  async function prepare(newVersion = false) {
    const result = await post<{ proposalId: string; version: number }>('/proposals', {
      analysisId,
      findingIds,
      goal,
      ...providerFields,
      ...(!newVersion ? { purpose } : {}),
      ...(newVersion && detail ? { proposalId: detail.id, expectedVersion: detail.version } : {}),
    });
    setSelection({ id: result.proposalId, version: result.version });
    setDetail(null);
    setConsent(false);
    setActiveTab('proposals');
    setNotice('Corrección solicitada. Los tres agentes (Ejecutor, Revisor, Aprobador) trabajarán en secuencia.');
  }

  // KPIs
  const totalAnalyses = overview?.analyses.length ?? 0;
  const pendingHumanApprovalCount =
    overview?.proposals.filter(p => p.state === 'pending_human_approval').length ?? 0;
  const inProgressCount =
    overview?.proposals.filter(p =>
      ['draft', 'pending_review', 'in_review', 'pending_policy_check', 'in_policy_check'].includes(p.state)
    ).length ?? 0;
  const authorizedCount =
    overview?.proposals.filter(p => p.state === 'authorized').length ?? 0;
  const rejectedCount =
    overview?.proposals.filter(p =>
      ['changes_requested', 'rejected', 'invalidated', 'execution_failed'].includes(p.state)
    ).length ?? 0;
  const totalProposals = overview?.proposals.length ?? 0;
  const totalPublications = overview?.publications.length ?? 0;
  const liveProposalsCount = overview?.proposals.filter(p => p.purpose === 'live').length ?? 0;

  // Filtered proposals
  const filteredProposals = (overview?.proposals ?? []).filter(item => {
    if (proposalsStatusFilter === 'waiting' && item.state !== 'pending_human_approval') return false;
    if (
      proposalsStatusFilter === 'in_progress' &&
      !['draft', 'pending_review', 'in_review', 'pending_policy_check', 'in_policy_check'].includes(item.state)
    )
      return false;
    if (proposalsStatusFilter === 'authorized' && item.state !== 'authorized') return false;
    if (proposalsStatusFilter === 'executed' && item.state !== 'executed') return false;
    if (
      proposalsStatusFilter === 'rejected_or_changes' &&
      !['changes_requested', 'rejected', 'invalidated', 'execution_failed'].includes(item.state)
    )
      return false;

    if (proposalsPurposeFilter !== 'all' && item.purpose !== proposalsPurposeFilter) return false;

    if (proposalsSearch.trim()) {
      const q = proposalsSearch.toLowerCase();
      const matchGoal = item.goal.toLowerCase().includes(q);
      const matchId = item.id.toLowerCase().includes(q);
      if (!matchGoal && !matchId) return false;
    }
    return true;
  });

  const totalProposalsPages = Math.max(1, Math.ceil(filteredProposals.length / proposalsPageSize));
  const safeProposalsPage = Math.min(Math.max(1, proposalsPage), totalProposalsPages);
  const paginatedProposals = filteredProposals.slice(
    (safeProposalsPage - 1) * proposalsPageSize,
    safeProposalsPage * proposalsPageSize
  );

  // Filtered / paginated analyses
  const analysesList = overview?.analyses ?? [];
  const totalAnalysesPages = Math.max(1, Math.ceil(analysesList.length / analysesPageSize));
  const safeAnalysesPage = Math.min(Math.max(1, analysesPage), totalAnalysesPages);
  const paginatedAnalyses = analysesList.slice(
    (safeAnalysesPage - 1) * analysesPageSize,
    safeAnalysesPage * analysesPageSize
  );

  // Filtered / paginated publications
  const pubsList = overview?.publications ?? [];
  const totalPubsPages = Math.max(1, Math.ceil(pubsList.length / pubsPageSize));
  const safePubsPage = Math.min(Math.max(1, pubsPage), totalPubsPages);
  const paginatedPubs = pubsList.slice(
    (safePubsPage - 1) * pubsPageSize,
    safePubsPage * pubsPageSize
  );

  return (
    <div className="proposals-dashboard code-review-dashboard">
      {/* Hero Context Banner matching proposals-hero-banner */}
      <section className="proposals-hero-banner">
        <div className="proposals-hero-main">
          <div className="proposals-live-badge">
            <span className="live-pulse-dot" />
            <span>INSPECCIÓN DE CÓDIGO · GITHUB + 3 AGENTES IA</span>
          </div>
          <h2 className="proposals-hero-title">Revisión de Código y Correcciones</h2>
          <p className="proposals-hero-subtitle">
            Inspección de calidad sobre commits de GitHub, formulación secuencial de parches mediante agentes IA
            con verificación previa y publicación controlada mediante Pull Requests hacia develop.
          </p>
        </div>

        <div className="proposals-hero-actions">
          <button
            type="button"
            className="proposals-refresh-btn"
            disabled={busy}
            onClick={() => void action(async () => { await refresh(); })}
            title="Actualizar datos de revisión de código"
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
              disabled={busy || running}
              onClick={() => {
                setShowCatalog(prev => !prev);
                if (!catalog) {
                  void action(async () => {
                    const value = await read<CodeCatalog>(prefix + '/catalog');
                    setCatalog(value);
                    setPaths([]);
                    setConsent(false);
                  });
                }
              }}
            >
              <Icon path={showCatalog ? 'M18 6L6 18 M6 6l12 12' : 'M12 5v14 M5 12h14'} />
              <span>{showCatalog ? 'Cerrar catálogo' : 'Nuevo análisis'}</span>
            </button>
          )}
        </div>
      </section>

      {/* Global Alerts & Notices matching proposals-error-banner / success-banner */}
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

      {running && (
        <div role="status" className="proposals-hero-banner" style={{ padding: '16px 20px', background: 'rgba(37, 99, 235, 0.9)' }}>
          <div className="proposals-hero-main" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="spin-icon">
              <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Proceso de revisión en ejecución. El historial se actualiza automáticamente y conserva las etapas completadas.
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Row matching proposals-kpi-grid */}
      <section className="proposals-kpi-grid" aria-label="Métricas de revisión de código">
        <div className="proposals-kpi-card">
          <div className="kpi-icon-box total">
            <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Total Análisis</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{totalAnalyses}</strong>
              <span className="kpi-subtext">guardados</span>
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
            <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Correcciones de Código</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{totalProposals}</strong>
              <span className="kpi-subtext">{liveProposalsCount} de uso real</span>
            </div>
          </div>
        </div>

        <div className="proposals-kpi-card">
          <div className="kpi-icon-box success">
            <Icon path="M18 15a3 3 0 1 0-2.82-2H15a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H9.82A3 3 0 1 0 9 22a3 3 0 0 0 2.82-2H11a4 4 0 0 0 4-4v-3a4 4 0 0 1 1.17-2.83A3 3 0 0 0 18 15z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          </div>
          <div className="kpi-info-box">
            <span className="kpi-label">Publicaciones y PRs</span>
            <div className="kpi-value-row">
              <strong className="kpi-number">{totalPublications}</strong>
              <span className="kpi-subtext">
                {overview?.writesEnabled ? 'GitHub habilitado' : 'Solo lectura'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* GitHub Catalog & File Selection Card (Collapsible) */}
      {project.canManageProject && showCatalog && (
        <CodeCatalogCard
          action={action}
          baseSha={baseSha}
          busy={busy}
          catalog={catalog}
          connected={connected}
          consent={consent}
          effort={effort}
          filter={filter}
          mode={mode}
          model={model}
          paths={paths}
          post={post}
          prefix={prefix}
          provider={provider}
          providerFields={providerFields}
          running={running}
          selectedModel={selectedModel}
          setActiveTab={setActiveTab}
          setAnalysis={setAnalysis}
          setAnalysisId={setAnalysisId}
          setBaseSha={setBaseSha}
          setCatalog={setCatalog}
          setConsent={setConsent}
          setEffort={setEffort}
          setFilter={setFilter}
          setMode={setMode}
          setModel={setModel}
          setNotice={setNotice}
          setPaths={setPaths}
          setShowCatalog={setShowCatalog}
          setWithAi={setWithAi}
          withAi={withAi}
        />
      )}

      {/* Modern Tabs Navigation */}
      <div className="code-tabs-container">
        <div className="code-nav-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'proposals'}
            className={'code-nav-tab-btn' + (activeTab === 'proposals' ? ' is-active' : '')}
            onClick={() => setActiveTab('proposals')}
          >
            <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            <span>Correcciones de Código</span>
            <span className="code-tab-pill">{totalProposals}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'analyses'}
            className={'code-nav-tab-btn' + (activeTab === 'analyses' ? ' is-active' : '')}
            onClick={() => setActiveTab('analyses')}
          >
            <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            <span>Análisis y Hallazgos</span>
            <span className="code-tab-pill">{totalAnalyses}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'coverage'}
            className={'code-nav-tab-btn' + (activeTab === 'coverage' ? ' is-active' : '')}
            onClick={() => setActiveTab('coverage')}
          >
            <Icon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            <span>Cobertura del Repositorio</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'publications'}
            className={'code-nav-tab-btn' + (activeTab === 'publications' ? ' is-active' : '')}
            onClick={() => setActiveTab('publications')}
          >
            <Icon path="M18 15a3 3 0 1 0-2.82-2H15a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H9.82A3 3 0 1 0 9 22a3 3 0 0 0 2.82-2H11a4 4 0 0 0 4-4v-3a4 4 0 0 1 1.17-2.83A3 3 0 0 0 18 15z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <span>Publicaciones y PRs</span>
            <span className="code-tab-pill">{totalPublications}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Proposals / Corrections */}
      {activeTab === 'proposals' && (
        <CodeCorrectionsTab
          action={action}
          authorizedCount={authorizedCount}
          catalog={catalog}
          expandedGoals={expandedGoals}
          filteredProposals={filteredProposals}
          inProgressCount={inProgressCount}
          overview={overview}
          paginatedProposals={paginatedProposals}
          pendingHumanApprovalCount={pendingHumanApprovalCount}
          prefix={prefix}
          project={project}
          proposalsPageSize={proposalsPageSize}
          proposalsPurposeFilter={proposalsPurposeFilter}
          proposalsSearch={proposalsSearch}
          proposalsStatusFilter={proposalsStatusFilter}
          rejectedCount={rejectedCount}
          safeProposalsPage={safeProposalsPage}
          selection={selection}
          setCatalog={setCatalog}
          setDetail={setDetail}
          setPaths={setPaths}
          setProposalsPage={setProposalsPage}
          setProposalsPageSize={setProposalsPageSize}
          setProposalsPurposeFilter={setProposalsPurposeFilter}
          setProposalsSearch={setProposalsSearch}
          setProposalsStatusFilter={setProposalsStatusFilter}
          setSelection={setSelection}
          setShowCatalog={setShowCatalog}
          toggleGoalExpand={toggleGoalExpand}
          totalProposals={totalProposals}
          totalProposalsPages={totalProposalsPages}
        />
      )}

      {/* TAB 2: Analyses & Findings */}
      {activeTab === 'analyses' && (
        <CodeAnalysesTab
          action={action}
          analysesList={analysesList}
          analysis={analysis}
          analysisId={analysisId}
          busy={busy}
          canPrepare={canPrepare}
          catalog={catalog}
          connected={connected}
          consent={consent}
          current={current}
          detail={detail}
          effort={effort}
          findingIds={findingIds}
          goal={goal}
          model={model}
          overview={overview}
          paginatedAnalyses={paginatedAnalyses}
          prefix={prefix}
          prepare={prepare}
          project={project}
          provider={provider}
          purpose={purpose}
          running={running}
          safeAnalysesPage={safeAnalysesPage}
          selectedModel={selectedModel}
          setAnalysesPage={setAnalysesPage}
          setAnalysis={setAnalysis}
          setAnalysisId={setAnalysisId}
          setCatalog={setCatalog}
          setConsent={setConsent}
          setEffort={setEffort}
          setFindingIds={setFindingIds}
          setGoal={setGoal}
          setModel={setModel}
          setPaths={setPaths}
          setPurpose={setPurpose}
          setShowCatalog={setShowCatalog}
          totalAnalysesPages={totalAnalysesPages}
        />
      )}

      {/* TAB 3: Repository Coverage */}
      {activeTab === 'coverage' && (
        <RepositoryCoverage
          key={project.id}
          project={project}
          csrfToken={csrfToken}
          onInspect={path => {
            setActiveTab('analyses');
            setShowCatalog(true);
            void action(async () => {
              const value = await read<CodeCatalog>(prefix + '/catalog');
              setCatalog(value);
              setPaths(value.files.some(file => file.path === path) ? [path] : []);
              setMode('files');
              setConsent(false);
              setNotice(
                value.files.some(file => file.path === path)
                  ? 'Archivo seleccionado. Prepara un análisis acotado antes de proponer su corrección.'
                  : 'Este archivo excede el alcance de corrección automática o está excluido. Conserva la evidencia y prepara una revisión manual.'
              );
            });
          }}
        />
      )}

      {/* TAB 4: Publications & PRs */}
      {activeTab === 'publications' && (
        <CodePublicationsTab
          action={action}
          busy={busy}
          csrfToken={csrfToken}
          overview={overview}
          paginatedPubs={paginatedPubs}
          post={post}
          project={project}
          pubsList={pubsList}
          refresh={refresh}
          safePubsPage={safePubsPage}
          setPubsPage={setPubsPage}
          totalPubsPages={totalPubsPages}
        />
      )}

      {/* Slide-over Inspection Drawer for Proposals matching proposals-detail-drawer */}
      {detail && !drawerHidden && (
        <CodeProposalDrawer
          action={action}
          busy={busy}
          confirmDecision={confirmDecision}
          confirmPublication={confirmPublication}
          confirmSimulation={confirmSimulation}
          connected={connected}
          consent={consent}
          current={current}
          detail={detail}
          model={model}
          overview={overview}
          post={post}
          project={project}
          providerFields={providerFields}
          reason={reason}
          running={running}
          setActiveTab={setActiveTab}
          setAnalysis={setAnalysis}
          setAnalysisId={setAnalysisId}
          setConfirmDecision={setConfirmDecision}
          setConfirmPublication={setConfirmPublication}
          setConfirmSimulation={setConfirmSimulation}
          setConsent={setConsent}
          setDetail={setDetail}
          setDrawerHidden={setDrawerHidden}
          setNotice={setNotice}
          setReason={setReason}
          setSelection={setSelection}
          versionPath={versionPath}
        />
      )}
    </div>
  );
}
