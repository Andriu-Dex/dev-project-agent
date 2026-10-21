import {RecoveryPanel} from './RecoveryPanel';
import {RepositoryCoverage} from './RepositoryCoverage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentVerdict,
  CodeAnalysisView,
  CodeCatalog,
  CodeOverview,
  CodeProposalView,
  ProjectAccess,
  ProviderOverview,
  ReasoningEffort,
} from '@dev-project-agent/contracts';
import { AgentModelSelect } from './AgentModelSelect';
import { readAgentProviders, providerDestination } from './agentProviders';
import { ReasoningSelect, effortLabels } from './ReasoningSelect';
import { Icon } from './Workspace';
import { Pagination } from './Pagination';

interface StateConfigItem {
  label: string;
  badgeClass: string;
  icon: string;
}

const defaultStateConfig: StateConfigItem = {
  label: 'En proceso',
  badgeClass: 'in-review',
  icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
};

const stateConfig: Record<string, StateConfigItem> = {
  running: {
    label: 'En ejecución',
    badgeClass: 'executing',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  ready: {
    label: 'Listo',
    badgeClass: 'executed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  failed: {
    label: 'Fallido',
    badgeClass: 'failed',
    icon: 'M18 6L6 18 M6 6l12 12',
  },
  interrupted: {
    label: 'Interrumpido',
    badgeClass: 'invalidated',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
  draft: {
    label: 'Preparando corrección',
    badgeClass: 'draft',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  pending_review: {
    label: 'Revisión pendiente',
    badgeClass: 'in-review',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  pending_policy_check: {
    label: 'Comprobación de política',
    badgeClass: 'in-review',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  pending_human_approval: {
    label: 'Esperando decisión del gestor',
    badgeClass: 'pending-approval',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
  authorized: {
    label: 'Autorizada por gestor',
    badgeClass: 'authorized',
    icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  },
  changes_requested: {
    label: 'Ajustes solicitados',
    badgeClass: 'changes-requested',
    icon: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  },
  rejected: {
    label: 'Rechazada',
    badgeClass: 'rejected',
    icon: 'M18 6L6 18 M6 6l12 12',
  },
  invalidated: {
    label: 'Invalidada o retirada',
    badgeClass: 'invalidated',
    icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  executing: {
    label: 'Publicando en GitHub',
    badgeClass: 'executing',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  executed: {
    label: 'Publicación verificada',
    badgeClass: 'executed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  execution_failed: {
    label: 'Publicación fallida',
    badgeClass: 'failed',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
  reconciliation_required: {
    label: 'Reconciliación requerida',
    badgeClass: 'changes-requested',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
  simulated: {
    label: 'Simulación registrada',
    badgeClass: 'authorized',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  queued: {
    label: 'En cola',
    badgeClass: 'draft',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  succeeded: {
    label: 'Publicado con éxito',
    badgeClass: 'executed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  blocked: {
    label: 'Bloqueado',
    badgeClass: 'failed',
    icon: 'M18 6L6 18 M6 6l12 12',
  },
};

function getStateConfig(state: string): StateConfigItem {
  return stateConfig[state] ?? defaultStateConfig;
}

const stages: Record<string, string> = {
  executor: 'Ejecutor',
  reviewer: 'Revisor',
  approver: 'Aprobador',
};

const categories: Record<string, string> = {
  correctness: 'Corrección funcional',
  security: 'Seguridad',
  duplication: 'Duplicación',
  maintainability: 'Mantenibilidad',
  complexity: 'Complejidad',
  performance: 'Rendimiento',
};

const severityLabels: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const checks: Record<string, string> = {
  pass: 'Superada',
  fail: 'No superada',
  not_checked: 'No comprobada',
};

const errors: Record<string, string> = {
  SERVICE_RESTARTED: 'El servicio se reinició. La solicitud no se repite automáticamente.',
  USAGE_LIMIT: 'El proveedor de IA alcanzó un límite de uso.',
  SOURCE_CHANGED: 'Cambió el commit o la conexión. Prepara un nuevo análisis.',
  CONNECTION_REQUIRED: 'Conecta ChatGPT u Ollama antes de continuar.',
  AUTHORIZATION_EXPIRED: 'La conexión venció. Vuelve a conectar el proveedor.',
  CONNECTION_CHANGED: 'La conexión cambió durante la solicitud.',
  AUTHORIZATION_CANCELLED: 'La conexión se canceló durante la solicitud.',
  INVALID_CODE_EVIDENCE: 'El modelo citó evidencia que no coincide con el código seleccionado.',
  INVALID_CODE_OUTPUT: 'La respuesta del modelo no tiene el formato requerido.',
  INVALID_CODE_SCOPE: 'La corrección excede los archivos o hallazgos permitidos.',
  INVALID_CODE_VERDICT: 'El dictamen no satisface la política.',
  BLOCKING_CHECK: 'Quedan comprobaciones o preguntas bloqueantes.',
  FORBIDDEN: 'Los permisos del gestor cambiaron.',
  HASH_MISMATCH: 'El dictamen no corresponde al contenido sellado.',
};

const explain = (code: string) => {
  if (code === 'INFERENCE_TIMEOUT') {
    return 'La respuesta agotó el tiempo de espera. La solicitud no se repite automáticamente; consulta el historial antes de continuar.';
  }
  if (code === 'INPUT_TOO_LARGE') {
    return 'La evidencia de esta etapa supera el límite de envío. Reduce los archivos seleccionados y prepara un nuevo análisis.';
  }
  if (code === 'INVALID_REQUEST') {
    return 'La solicitud al proveedor no cumple el formato permitido. Revisa su configuración.';
  }
  return errors[code] ?? 'No se pudo completar la solicitud. Revisa las fuentes y la conexión antes de reintentar.';
};

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

async function read<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'No se pudo consultar el estado.');
  return body as T;
}

function downloadPatch(detail: CodeProposalView) {
  if (!detail.candidate) return;
  const url = URL.createObjectURL(new Blob([detail.candidate.patch], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `proposal-${detail.id}-v${detail.version}.patch`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function splitGoal(goal: string): { title: string; description: string } {
  if (!goal) return { title: 'Corrección propuesta', description: '' };
  const periodMatch = goal.match(/\.\s+/);
  if (periodMatch && periodMatch.index !== undefined && periodMatch.index > 15 && periodMatch.index < 160) {
    return {
      title: goal.slice(0, periodMatch.index + 1).trim(),
      description: goal.slice(periodMatch.index + periodMatch[0].length).trim(),
    };
  }
  const colonIndex = goal.indexOf(': ');
  if (colonIndex > 0 && colonIndex < 50) {
    const afterColon = goal.slice(colonIndex + 2);
    const nextPeriod = afterColon.indexOf('. ');
    if (nextPeriod > 0 && nextPeriod < 140) {
      const cut = colonIndex + 2 + nextPeriod + 1;
      return {
        title: goal.slice(0, cut).trim(),
        description: goal.slice(cut).trim(),
      };
    }
  }
  if (goal.length <= 120) {
    return { title: goal, description: '' };
  }
  const spaceIdx = goal.lastIndexOf(' ', 110);
  const cut = spaceIdx > 40 ? spaceIdx : 110;
  return {
    title: goal.slice(0, cut).trim() + '…',
    description: goal.slice(cut).trim(),
  };
}

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
        <div className="code-catalog-card">
          <div className="code-catalog-header">
            <div>
              <h3>Seleccionar código fuente de GitHub</h3>
              <p className="muted">
                Selecciona hasta 8 archivos de un commit exacto para inspeccionar su calidad y generar correcciones.
              </p>
            </div>
            <button
              type="button"
              className="proposals-refresh-btn"
              style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-base)', borderColor: 'var(--color-border)' }}
              disabled={busy || running}
              onClick={() =>
                void action(async () => {
                  const value = await read<CodeCatalog>(prefix + '/catalog');
                  setCatalog(value);
                  setPaths([]);
                  setConsent(false);
                })
              }
            >
              <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              <span>{catalog ? 'Refrescar catálogo' : 'Leer catálogo de GitHub'}</span>
            </button>
          </div>

          {catalog && (
            <div className="code-catalog-body">
              {/* Repository Metadata Chips */}
              <div className="code-repo-meta">
                <span className="code-meta-chip">
                  <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  <strong>Repositorio:</strong> {catalog.connection.owner}/{catalog.connection.repository}
                </span>
                <span className="code-meta-chip">
                  <Icon path="M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9" />
                  <strong>Rama:</strong> <code>{catalog.connection.branch}</code>
                </span>
                <span className="code-meta-chip">
                  <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  <strong>Commit HEAD:</strong> <code className="content-hash">{catalog.head.slice(0, 10)}</code>
                </span>
                <span className="code-meta-chip muted-chip">
                  Límites: máx {catalog.limits.files} archivos ({catalog.limits.totalBytes / 1000} KB tot)
                </span>
              </div>

              {/* File Search & Filter */}
              <div className="code-filter-row">
                <div className="code-search-box">
                  <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  <input
                    type="search"
                    placeholder="Buscar archivo por ruta (ej: src/utils.ts)..."
                    value={filter}
                    onChange={event => setFilter(event.target.value)}
                  />
                  {filter && (
                    <button type="button" className="code-search-clear" onClick={() => setFilter('')}>
                      <Icon path="M6 18L18 6M6 6l12 12" />
                    </button>
                  )}
                </div>
                <div className="code-selection-counter">
                  <strong>{paths.length}</strong> de {catalog.limits.files} seleccionados
                </div>
              </div>

              {/* File Checklist */}
              <fieldset className="code-file-list" disabled={busy || running}>
                <legend className="sr-only">Archivos del repositorio</legend>
                {catalog.files
                  .filter(file => file.path.toLowerCase().includes(filter.toLowerCase()))
                  .map(file => {
                    const isSelected = paths.includes(file.path);
                    return (
                      <label className={`code-file-item ${isSelected ? 'selected' : ''}`} key={file.path}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isSelected && paths.length >= catalog.limits.files}
                          onChange={event => {
                            setPaths(prev =>
                              event.target.checked ? [...prev, file.path] : prev.filter(p => p !== file.path)
                            );
                            setConsent(false);
                          }}
                        />
                        <span className="code-file-name">
                          <code>{file.path}</code>
                        </span>
                        <span className="code-file-size">{Math.ceil(file.size / 1000)} KB</span>
                      </label>
                    );
                  })}
              </fieldset>
              {!catalog.files.length && (
                <p className="muted">No hay archivos admitidos dentro de los límites en este catálogo.</p>
              )}

              {/* Analysis Scope & Comparison */}
              <div className="code-scope-grid">
                <div className="editor-field">
                  <label htmlFor="code-scope">Alcance del análisis</label>
                  <select
                    id="code-scope"
                    className="editor-select"
                    value={mode}
                    onChange={event => {
                      setMode(event.target.value as typeof mode);
                      setConsent(false);
                    }}
                    disabled={busy || running}
                  >
                    <option value="files">Archivos seleccionados en el commit actual</option>
                    <option value="comparison">Archivos seleccionados que cambiaron desde otro commit</option>
                  </select>
                </div>

                {mode === 'comparison' && (
                  <div className="editor-field">
                    <label htmlFor="code-base">Commit anterior para comparar (SHA completo de 40 dígitos)</label>
                    <input
                      id="code-base"
                      className="editor-input"
                      maxLength={40}
                      placeholder="40 caracteres hexadecimales..."
                      value={baseSha}
                      onChange={event => {
                        setBaseSha(event.target.value);
                        setConsent(false);
                      }}
                      disabled={busy || running}
                    />
                    <small className="editor-hint">
                      Los archivos deben figurar en la comparación. Commits idénticos no acreditan calidad.
                    </small>
                  </div>
                )}
              </div>

              {/* AI Analysis Integration Option */}
              <div className="code-ai-section">
                <label className="confirmation code-ai-toggle">
                  <input
                    type="checkbox"
                    checked={withAi}
                    onChange={event => {
                      setWithAi(event.target.checked);
                      setConsent(false);
                    }}
                    disabled={busy || running}
                  />
                  <span>
                    <strong>Añadir revisión con Inteligencia Artificial</strong> a las comprobaciones locales deterministas
                  </span>
                </label>

                {withAi && (
                  <div className="code-ai-config">
                    {!connected ? (
                      <div className="proposals-error-banner" style={{ marginTop: '10px' }}>
                        <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <span>
                          Conecta ChatGPT o inicia Ollama en Configuración para activar el análisis con IA.
                          Las comprobaciones locales estáticas están disponibles de inmediato sin conexión externa.
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="editor-model-row" style={{ marginTop: '10px' }}>
                          <AgentModelSelect
                            id="code-model"
                            models={provider?.connection.models ?? []}
                            value={model}
                            onChange={val => {
                              setModel(val);
                              setEffort('');
                              setConsent(false);
                            }}
                            disabled={busy || running || !connected}
                          />
                          <ReasoningSelect
                            id="code-effort"
                            model={selectedModel}
                            value={effort}
                            onChange={val => {
                              setEffort(val);
                              setConsent(false);
                            }}
                            disabled={busy || running || !connected}
                          />
                        </div>

                        <label className="editor-consent-box" style={{ marginTop: '12px' }}>
                          <input
                            type="checkbox"
                            checked={consent}
                            onChange={event => setConsent(event.target.checked)}
                            disabled={busy || running || !connected}
                          />
                          <span>
                            Autorizo enviar a <strong>{providerDestination(model)}</strong> el contenido de los archivos
                            seleccionados para este análisis.
                          </span>
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Launch Analysis Action */}
              <div className="code-catalog-actions">
                <button
                  type="button"
                  className="editor-submit-btn"
                  disabled={
                    busy ||
                    running ||
                    !paths.length ||
                    (mode === 'comparison' && !/^[a-f0-9]{40}$/.test(baseSha)) ||
                    (withAi && (!connected || !consent || !model))
                  }
                  onClick={() =>
                    void action(async () => {
                      const result = await post<{ id: string }>('/analyses', {
                        paths,
                        expectedHead: catalog.head,
                        mode,
                        ...(mode === 'comparison' ? { baseSha } : {}),
                        withAi,
                        ...(withAi ? providerFields : {}),
                      });
                      setAnalysisId(result.id);
                      setAnalysis(null);
                      setConsent(false);
                      setShowCatalog(false);
                      setActiveTab('analyses');
                      setNotice('Análisis guardado. Consulta el resultado y sus límites.');
                    })
                  }
                >
                  <Icon path="m8 7-5 5 5 5 m8-10 5 5-5 5 m-3-14-2 18" />
                  <span>Analizar código seleccionado ({paths.length} archivos)</span>
                </button>
              </div>
            </div>
          )}
        </div>
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
      )}

      {/* TAB 2: Analyses & Findings */}
      {activeTab === 'analyses' && (
        <div className="code-analyses-list-card">
          <div className="code-catalog-header">
            <div>
              <h3>Historial de Análisis de Código</h3>
              <p className="muted">
                Auditorías estáticas y mediante IA sobre commits guardados. Haz clic en cualquiera para abrir sus hallazgos.
              </p>
            </div>
            {project.canManageProject && (
              <button
                type="button"
                className="proposals-new-btn"
                onClick={() => {
                  setShowCatalog(true);
                  if (!catalog) {
                    void action(async () => {
                      const val = await read<CodeCatalog>(prefix + '/catalog');
                      setCatalog(val);
                      setPaths([]);
                    });
                  }
                }}
              >
                <Icon path="M12 5v14 M5 12h14" />
                <span>Nuevo análisis</span>
              </button>
            )}
          </div>

          {!overview?.analyses.length ? (
            <div className="proposals-empty-state">
              <div className="empty-icon-shield">
                <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </div>
              <h3>Sin análisis guardados</h3>
              <p>Aún no hay análisis de código registrados en este proyecto.</p>
            </div>
          ) : (
            <div className="code-analyses-table-wrap">
              <table className="code-analyses-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Modelo de análisis</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAnalyses.map(item => {
                    const conf = getStateConfig(item.status);
                    const isSelected = analysisId === item.id;
                    return (
                      <tr key={item.id} className={isSelected ? 'selected-row' : ''}>
                        <td>{dates(item.createdAt)}</td>
                        <td>
                          <span className={'proposal-status-badge ' + conf.badgeClass}>
                            <Icon path={conf.icon} />
                            <span>{conf.label}</span>
                          </span>
                          {item.errorCode && (
                            <small className="form-error block-error">{explain(item.errorCode)}</small>
                          )}
                        </td>
                        <td>
                          <code>{item.model ?? 'Comprobaciones locales'}</code>
                          {item.reasoningEffort && (
                            <small className="muted block-sub">
                              Esfuerzo: {effortLabels[item.reasoningEffort]}
                            </small>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="proposal-detail-trigger-btn"
                            disabled={busy}
                            onClick={() => {
                              setAnalysisId(item.id);
                              setAnalysis(null);
                            }}
                          >
                            <span>{isSelected ? 'Cerrar vista' : 'Examinar hallazgos'}</span>
                            <Icon path={isSelected ? 'M6 18L18 6M6 6l12 12' : 'M9 5l7 7-7 7'} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination for analyses */}
          {analysesList.length > 0 && totalAnalysesPages > 1 && (
            <footer className="planning-pagination-bar" style={{ marginTop: '16px', borderRadius: '8px' }}>
              <div className="pagination-summary">
                <span>Pág. {safeAnalysesPage} de {totalAnalysesPages}</span>
              </div>
              <nav className="pagination-pages-nav" aria-label="Páginas">
                <button
                  type="button"
                  className="pagination-arrow-btn"
                  disabled={safeAnalysesPage <= 1}
                  onClick={() => setAnalysesPage(p => Math.max(1, p - 1))}
                >
                  <Icon path="M15 19l-7-7 7-7" />
                </button>
                <button
                  type="button"
                  className="pagination-arrow-btn"
                  disabled={safeAnalysesPage >= totalAnalysesPages}
                  onClick={() => setAnalysesPage(p => Math.min(totalAnalysesPages, p + 1))}
                >
                  <Icon path="M9 5l7 7-7 7" />
                </button>
              </nav>
            </footer>
          )}

          {/* Selected Analysis Detail Section */}
          {analysis && (
            <div className="code-analysis-detail-card" id="active-analysis-detail">
              <header className="code-analysis-detail-header">
                <div>
                  <div className="proposal-meta-top">
                    <span className={'proposal-status-badge ' + getStateConfig(analysis.status).badgeClass}>
                      <Icon path={getStateConfig(analysis.status).icon} />
                      <span>{getStateConfig(analysis.status).label}</span>
                    </span>
                    <span className="code-meta-chip">
                      {dates(analysis.createdAt)}
                    </span>
                    <span className="code-meta-chip">
                      {analysis.model ?? 'Comprobaciones locales estáticas'}
                    </span>
                  </div>
                  <h3>Resultados de la auditoría de código</h3>
                </div>
                <button
                  type="button"
                  className="editor-cancel-btn"
                  onClick={() => setAnalysisId('')}
                >
                  <Icon path="M6 18L18 6M6 6l12 12" />
                  <span>Cerrar análisis</span>
                </button>
              </header>

              {/* Source commit and files info */}
              {analysis.source && (
                <div className="code-analysis-source-box">
                  <p>
                    <strong>Commit analizado:</strong>{' '}
                    <code className="content-hash">{analysis.source.head}</code> ·{' '}
                    <strong>Rama:</strong> <code>{analysis.source.connection.branch}</code> ·{' '}
                    <strong>{analysis.source.files.length}</strong>{' '}
                    {analysis.source.files.length === 1 ? 'archivo' : 'archivos'}
                  </p>
                  <details className="code-source-files-details">
                    <summary>Ver código fuente y evidencia de los archivos analizados</summary>
                    <div className="code-source-files-list">
                      {analysis.source.files.map(file => (
                        <details key={file.path} className="code-source-file-block">
                          <summary>
                            <code>{file.path}</code> · SHA: <code>{file.blobSha.slice(0, 10)}</code>
                          </summary>
                          <pre className="code-block">{file.content}</pre>
                        </details>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {/* Checks & Summary */}
              {analysis.result && (
                <div className="code-analysis-result-body">
                  <div className="code-analysis-summary-banner">
                    <p>{analysis.result.summary}</p>
                  </div>

                  {/* Automated checks */}
                  <div className="code-checks-section">
                    <h4>Comprobaciones deterministas ({analysis.result.checks.length})</h4>
                    <div className="code-checks-grid">
                      {analysis.result.checks.map((check, index) => (
                        <div key={index} className={`code-check-card ${check.status}`}>
                          <div className="code-check-header">
                            <span className="code-check-path"><code>{check.path}</code></span>
                            <span className={`code-check-badge ${check.status}`}>
                              {checks[check.status]}
                            </span>
                          </div>
                          <p className="code-check-msg">{check.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Findings Explorer */}
                  <div className="code-findings-section">
                    <h4>
                      Hallazgos detectados ({analysis.result.findings.length})
                    </h4>
                    {!analysis.result.findings.length ? (
                      <div className="proposals-success-banner">
                        <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        <span>
                          No se encontraron hallazgos negativos dentro de este alcance delimitado. Esto no acredita
                          la calidad del proyecto completo ni sustituye la revisión humana.
                        </span>
                      </div>
                    ) : (
                      <div className="code-findings-grid">
                        {analysis.result.findings.map(item => {
                          const isSelectedFinding = findingIds.includes(item.id);
                          return (
                            <article
                              className={`code-finding-card ${isSelectedFinding ? 'selected' : ''}`}
                              key={item.id}
                            >
                              <header className="code-finding-header">
                                <div className="code-finding-tags">
                                  <span
                                    className={`finding-severity-badge severity-${item.severity}`}
                                  >
                                    Severidad {severityLabels[item.severity]}
                                  </span>
                                  <span className="finding-category-badge">
                                    {categories[item.category] ?? item.category}
                                  </span>
                                  <span className="finding-confidence-badge">
                                    {item.confidence === 'confirmed' ? 'Confirmado' : 'Hipótesis'}
                                  </span>
                                </div>
                                <span className="finding-location">
                                  <code>{item.path}:{item.startLine}–{item.endLine}</code>
                                </span>
                              </header>

                              <h5 className="code-finding-title">{item.title}</h5>
                              <p className="code-finding-explanation">{item.explanation}</p>

                              {item.evidence && (
                                <div className="code-finding-evidence">
                                  <span className="evidence-label">Evidencia observada:</span>
                                  <pre className="code-block">{item.evidence}</pre>
                                </div>
                              )}

                              <div className="code-finding-recommendation">
                                <strong>Recomendación:</strong> {item.recommendation}
                              </div>

                              {project.canManageProject && (
                                <label className="confirmation code-finding-select-toggle">
                                  <input
                                    type="checkbox"
                                    checked={isSelectedFinding}
                                    disabled={
                                      busy ||
                                      running ||
                                      (!isSelectedFinding && findingIds.length >= 10)
                                    }
                                    onChange={event => {
                                      setFindingIds(prev =>
                                        event.target.checked
                                          ? [...prev, item.id]
                                          : prev.filter(id => id !== item.id)
                                      );
                                      setConsent(false);
                                    }}
                                  />
                                  <span>
                                    {isSelectedFinding
                                      ? 'Hallazgo seleccionado para corrección'
                                      : 'Seleccionar este hallazgo para corregir con los 3 agentes'}
                                  </span>
                                </label>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Limitations */}
                  {analysis.result.limitations.length > 0 && (
                    <div className="code-limitations-section">
                      <h4>Límites y restricciones de esta revisión</h4>
                      <ul className="code-limitations-list">
                        {analysis.result.limitations.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Correction Creator from Findings */}
                  {project.canManageProject && analysis.result.findings.length > 0 && (
                    <div className="code-correction-creator-card">
                      <div className="code-creator-header">
                        <h4>Preparar corrección con los 3 Agentes de IA</h4>
                        <p className="muted">
                          Los 3 agentes (Ejecutor, Revisor, Aprobador) colaborarán secuencialmente para generar un parche
                          delimitado sobre los hallazgos seleccionados ({findingIds.length} seleccionados).
                        </p>
                      </div>

                      <div className="editor-grid">
                        <div className="editor-field">
                          <label htmlFor="code-purpose">Propósito de la corrección</label>
                          <select
                            id="code-purpose"
                            className="editor-select"
                            value={purpose}
                            disabled={busy || running}
                            onChange={event => {
                              setPurpose(event.target.value as typeof purpose);
                              setConsent(false);
                            }}
                          >
                            <option value="demonstration">Demostración (sin publicar)</option>
                            <option value="live">Uso real (creará rama y PR tras tu aprobación)</option>
                          </select>
                        </div>
                      </div>

                      <div className="editor-model-row" style={{ marginTop: '14px' }}>
                        <AgentModelSelect
                          id="code-model-prepare"
                          models={provider?.connection.models ?? []}
                          value={model}
                          onChange={val => {
                            setModel(val);
                            setEffort('');
                            setConsent(false);
                          }}
                          disabled={busy || running || !connected}
                        />

                        <ReasoningSelect
                          id="code-effort-prepare"
                          model={selectedModel}
                          value={effort}
                          onChange={val => {
                            setEffort(val);
                            setConsent(false);
                          }}
                          disabled={busy || running || !connected}
                        />
                      </div>

                      <div className="editor-field full-width" style={{ marginTop: '14px' }}>
                        <label htmlFor="code-goal">Objetivo y comportamiento esperado de la corrección</label>
                        <textarea
                          id="code-goal"
                          className="editor-textarea"
                          maxLength={1000}
                          rows={3}
                          value={goal}
                          onChange={event => {
                            setGoal(event.target.value);
                            setConsent(false);
                          }}
                          disabled={busy || running}
                          placeholder="Indica qué hallazgo deseas corregir y el comportamiento esperado, sin credenciales..."
                        />
                        <div className="textarea-footer">
                          <span className="char-count">{goal.length}/1000</span>
                        </div>
                      </div>

                      <label className="editor-consent-box" style={{ marginTop: '12px' }}>
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={event => setConsent(event.target.checked)}
                          disabled={busy || running || !connected}
                        />
                        <span>
                          Autorizo enviar a <strong>{providerDestination(model)}</strong> el código de los hallazgos seleccionados y el objetivo de esta solicitud.
                        </span>
                      </label>

                      <div className="editor-actions-row">
                        {current && ['changes_requested', 'invalidated', 'execution_failed'].includes(detail.state) && (
                          <button
                            type="button"
                            className="editor-cancel-btn"
                            disabled={!canPrepare}
                            onClick={() => void action(() => prepare(true))}
                          >
                            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            <span>Preparar nueva versión</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="editor-submit-btn"
                          disabled={!canPrepare}
                          onClick={() => void action(() => prepare())}
                        >
                          <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          <span>Preparar corrección con los tres agentes</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
        <div className="code-analyses-list-card">
          <div className="code-catalog-header">
            <div>
              <h3>Historial de Publicaciones y Pull Requests en GitHub</h3>
              <p className="muted">
                Registro de ramas y PRs creados hacia develop. Toda integración en UTAPED requiere revisión humana externa.
              </p>
            </div>
          </div>

          {!overview?.publications.length ? (
            <div className="proposals-empty-state">
              <div className="empty-icon-shield">
                <Icon path="M18 15a3 3 0 1 0-2.82-2H15a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H9.82A3 3 0 1 0 9 22a3 3 0 0 0 2.82-2H11a4 4 0 0 0 4-4v-3a4 4 0 0 1 1.17-2.83A3 3 0 0 0 18 15z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              </div>
              <h3>Sin publicaciones ni PRs</h3>
              <p>Aún no hay publicaciones ni simulaciones registradas en este proyecto.</p>
            </div>
          ) : (
            <div className="code-publications-grid">
              {paginatedPubs.map(item => {
                const conf = getStateConfig(item.status);
                return (
                  <article className="code-publication-card" key={item.id}>
                    <header className="code-publication-header">
                      <div className="code-publication-title-group">
                        <span className={'proposal-status-badge ' + conf.badgeClass}>
                          <Icon path={conf.icon} />
                          <span>{item.status === 'simulated' ? 'Simulación' : 'Publicación'}</span>
                        </span>
                        <span className="proposal-version-chip">v{item.version}</span>
                      </div>
                      <span className="proposal-card-date">{dates(item.createdAt)}</span>
                    </header>

                    <div className="code-publication-body">{item.status==='succeeded'&&<RecoveryPanel project={project} csrfToken={csrfToken} originalId={item.id} target="github" onChanged={()=>void refresh()}/>}
                      <p className="code-pub-status-msg">
                        {item.status === 'simulated'
                          ? 'No se creó ninguna rama, commit ni PR real en GitHub.'
                          : item.status === 'succeeded'
                            ? 'Rama y PR verificados en GitHub. Integración humana pendiente.'
                            : conf.label}
                      </p>

                      <div className="code-pub-branch-box">
                        <Icon path="M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9" />
                        <span>Rama:</span>
                        <code>{item.branch}</code>
                      </div>

                      {item.errorCode && (
                        <div className="proposals-error-banner" style={{ margin: '8px 0', padding: '8px 12px' }}>
                          <span>{explain(item.errorCode)}</span>
                        </div>
                      )}

                      {item.pullUrl && (
                        <div className="code-pub-link-box">
                          <a
                            href={item.pullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="editor-submit-btn"
                            style={{ textDecoration: 'none', display: 'inline-flex' }}
                          >
                            <Icon path="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            <span>Abrir PR en GitHub para revisión humana</span>
                          </a>
                        </div>
                      )}

                      {item.status === 'reconciliation_required' && project.canManageProject && (
                        <button
                          type="button"
                          className="editor-cancel-btn"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await post('/publications/' + item.id + '/reconcile', {}, false);
                            })
                          }
                        >
                          <span>Consultar resultado sin repetir escrituras</span>
                        </button>
                      )}

                      {/* Preserved Publication Plan Accordion */}
                      {item.plan && (
                        <details className="code-pub-plan-details">
                          <summary>Ver plan de publicación conservado</summary>
                          <div className="code-pub-plan-content">
                            <p>
                              <strong>Destino:</strong> {item.plan.repository} · Rama base:{' '}
                              <code>{item.plan.baseBranch}</code> · Commit base:{' '}
                              <code>{item.plan.baseSha.slice(0, 10)}</code>
                            </p>
                            <p className="content-hash">
                              Sello del contenido: {item.plan.contentHash}
                            </p>
                            <ul>
                              {item.plan.files.map(file => (
                                <li key={file.path}>
                                  <code>{file.path}</code> · Blobs: {file.beforeBlob.slice(0, 8)} →{' '}
                                  {file.afterBlob.slice(0, 8)}
                                </li>
                              ))}
                            </ul>
                            <pre className="code-block">{item.plan.title + '\n\n' + item.plan.body}</pre>
                          </div>
                        </details>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination for publications */}
          {pubsList.length > 0 && totalPubsPages > 1 && (
            <footer className="planning-pagination-bar" style={{ marginTop: '16px', borderRadius: '8px' }}>
              <div className="pagination-summary">
                <span>Pág. {safePubsPage} de {totalPubsPages}</span>
              </div>
              <nav className="pagination-pages-nav" aria-label="Páginas">
                <button
                  type="button"
                  className="pagination-arrow-btn"
                  disabled={safePubsPage <= 1}
                  onClick={() => setPubsPage(p => Math.max(1, p - 1))}
                >
                  <Icon path="M15 19l-7-7 7-7" />
                </button>
                <button
                  type="button"
                  className="pagination-arrow-btn"
                  disabled={safePubsPage >= totalPubsPages}
                  onClick={() => setPubsPage(p => Math.min(totalPubsPages, p + 1))}
                >
                  <Icon path="M9 5l7 7-7 7" />
                </button>
              </nav>
            </footer>
          )}
        </div>
      )}

      {/* Slide-over Inspection Drawer for Proposals matching proposals-detail-drawer */}
      {detail && !drawerHidden && (
        <div
          className="proposals-drawer-backdrop"
          onClick={() => setSelection(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="code-drawer-title"
        >
          <aside
            className="proposals-detail-drawer code-detail-drawer"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <header className="drawer-header">
              <div className="drawer-header-meta">
                <span className={'proposal-status-badge ' + getStateConfig(detail.state).badgeClass}>
                  <Icon path={getStateConfig(detail.state).icon} />
                  <span>{getStateConfig(detail.state).label}</span>
                </span>
                <span
                  className={
                    'proposal-purpose-chip ' +
                    (detail.purpose === 'live' ? 'live' : 'demonstration')
                  }
                >
                  {detail.purpose === 'live' ? 'Uso real' : 'Demostración'}
                </span>

                <div className="drawer-version-picker">
                  <label htmlFor="code-version-select">Versión:</label>
                  <select
                    id="code-version-select"
                    value={detail.version}
                    onChange={event => {
                      setSelection({ id: detail.id, version: Number(event.target.value) });
                      setDetail(null);
                    }}
                    disabled={busy}
                    className="drawer-version-select"
                  >
                    {Array.from({ length: detail.latestVersion }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        v{index + 1} {index + 1 === detail.latestVersion ? '(actual)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelection(null)}
                aria-label="Cerrar detalle"
                title="Cerrar (Esc)"
              >
                <Icon path="M18 6L6 18 M6 6l12 12" />
              </button>
            </header>

            {/* Scroll Container spanning the full modal under sticky header */}
            <div className="drawer-scroll-body">
              <div className="drawer-title-area">
                <div className="drawer-title-heading-row">
                  <div className="drawer-title-icon-box">
                    <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </div>
                  <div className="drawer-title-content">
                    <span className="drawer-badge-kicker">Revisión de Código · Parche Candidato</span>
                    {(() => {
                      const { title } = splitGoal(detail.goal);
                      return <h3 id="code-drawer-title">{title}</h3>;
                    })()}
                  </div>
                </div>

                {(() => {
                  const { description } = splitGoal(detail.goal);
                  if (!description) return null;
                  return (
                    <div className="drawer-goal-box">
                      <div className="goal-box-header">
                        <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <span>Objetivo y especificación esperada:</span>
                      </div>
                      <p className="drawer-description-text">{description}</p>
                    </div>
                  );
                })()}

                <div className="drawer-meta-chips-row">
                  <span className="drawer-meta-chip">
                    <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    <span>{dates(detail.createdAt)}</span>
                  </span>
                  <span className="drawer-meta-chip">
                    <Icon path="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    <span>ID: <code>{detail.id.slice(0, 8)}</code></span>
                  </span>
                  <button
                    type="button"
                    className="drawer-meta-chip origin is-clickable"
                    onClick={() => {
                      setAnalysisId(detail.analysisId);
                      setAnalysis(null);
                      setActiveTab('analyses');
                      setDrawerHidden(true);
                    }}
                    title="Ver análisis y hallazgos de origen"
                  >
                    <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    <span>Análisis de origen: <code>{detail.analysisId.slice(0, 8)}</code> →</span>
                  </button>
                </div>
              </div>

              {/* 6-Stage Stepper for Code Corrections */}
              <div className="proposal-journey-container">
                <nav className="proposal-stepper" aria-label="Progreso de la corrección">
                  {[
                    { step: 1, label: '1. Análisis', status: 'is-done' },
                    {
                      step: 2,
                      label: '2. Ejecutor',
                      status: detail.messages.some(m => m.stage === 'executor' && m.status === 'succeeded')
                        ? 'is-done'
                        : detail.state === 'draft'
                          ? 'is-current'
                          : '',
                    },
                    {
                      step: 3,
                      label: '3. Revisor',
                      status: detail.messages.some(m => m.stage === 'reviewer' && m.status === 'succeeded')
                        ? 'is-done'
                        : ['pending_review', 'in_review'].includes(detail.state)
                          ? 'is-current'
                          : '',
                    },
                    {
                      step: 4,
                      label: '4. Aprobador',
                      status: detail.messages.some(m => m.stage === 'approver' && m.status === 'succeeded')
                        ? 'is-done'
                        : ['pending_policy_check', 'in_policy_check'].includes(detail.state)
                          ? 'is-current'
                          : '',
                    },
                    {
                      step: 5,
                      label: '5. Gestor',
                      status: ['authorized', 'executing', 'executed', 'simulated'].includes(detail.state)
                        ? 'is-done'
                        : detail.state === 'pending_human_approval'
                          ? 'is-current'
                          : ['changes_requested', 'rejected'].includes(detail.state)
                            ? 'is-failed'
                            : '',
                    },
                    {
                      step: 6,
                      label: '6. Publicación',
                      status: ['executed', 'simulated'].includes(detail.state)
                        ? 'is-done'
                        : detail.state === 'executing'
                          ? 'is-current'
                          : '',
                    },
                  ].map(s => (
                    <div key={s.step} className={`stepper-step ${s.status}`}>
                      <div className="stepper-dot">
                        {s.status === 'is-done' ? (
                          <Icon path="M5 13l4 4L19 7" />
                        ) : s.status === 'is-failed' ? (
                          <Icon path="M6 18L18 6M6 6l12 12" />
                        ) : (
                          <span>{s.step}</span>
                        )}
                      </div>
                      <span className="stepper-label">{s.label}</span>
                    </div>
                  ))}
                </nav>
              </div>

              {/* Content Flow Container */}
              <div className="drawer-content-flow">
                {/* Candidate Correction Details */}
                {detail.candidate && (
                <div className="drawer-section-card">
                  <div className="section-card-header accent">
                    <div className="section-header-left">
                      <div className="section-icon-badge">
                        <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </div>
                      <div>
                        <span className="section-kicker">Etapa 2 · Agente Ejecutor</span>
                        <h4 style={{ margin: 0 }}>Propuesta Técnica Formulada</h4>
                      </div>
                    </div>
                  </div>

                  <div className="proposal-objective-box">
                    <div className="objective-badge-row">
                      <span className="objective-pill-tag">Objetivo del Parche</span>
                    </div>
                    <strong className="objective-title">{detail.candidate.correction.objective}</strong>
                    <div className="objective-justification-wrap">
                      <span className="justification-heading">Justificación técnica del cambio:</span>
                      <p className="code-justification-p">{detail.candidate.correction.justification}</p>{detail.candidate.documentation&&<details className="change-documentation"><summary>Documentación y justificación de esta versión</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{detail.candidate.documentation}</pre></details>}
                    </div>
                  </div>

                  <div className="code-impact-risk-grid">
                    <div className="code-info-subcard impact">
                      <div className="subcard-header">
                        <div className="subcard-icon-box impact">
                          <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                        </div>
                        <span className="subcard-title">Impacto Proyectado</span>
                      </div>
                      <p>{detail.candidate.correction.impact}</p>
                    </div>

                    <div className="code-info-subcard verification">
                      <div className="subcard-header">
                        <div className="subcard-icon-box verification">
                          <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        </div>
                        <span className="subcard-title">Plan de Verificación</span>
                      </div>
                      <p>{detail.candidate.correction.verificationPlan}</p>
                    </div>

                    <div className="code-info-subcard recovery">
                      <div className="subcard-header">
                        <div className="subcard-icon-box recovery">
                          <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </div>
                        <span className="subcard-title">Plan de Recuperación</span>
                      </div>
                      <p>{detail.candidate.correction.recoveryPlan}</p>
                    </div>
                  </div>

                  {detail.candidate.correction.risks.length > 0 && (
                    <div className="code-risks-subcard">
                      <span className="subcard-title">Riesgos evaluados por los agentes</span>
                      <ul>
                        {detail.candidate.correction.risks.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.candidate.correction.unresolvedQuestions.length > 0 && (
                    <div className="proposals-error-banner" style={{ margin: '14px 0' }}>
                      <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <div>
                        <strong>Preguntas bloqueantes sin resolver:</strong>
                        <ul>
                          {detail.candidate.correction.unresolvedQuestions.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Git Diff Viewer */}
                  <div className="code-diff-viewer-section">
                    <div className="diff-header-bar">
                      <div className="diff-title-group">
                        <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        <span className="diff-title">Parche unificado (Git Diff)</span>
                      </div>
                      <button
                        type="button"
                        className="editor-cancel-btn"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => downloadPatch(detail)}
                      >
                        <Icon path="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" />
                        <span>Descargar .patch</span>
                      </button>
                    </div>
                    <pre className="code-block code-diff-viewer">
                      {detail.candidate.patch.split('\n').map((line, index) => (
                        <div
                          key={index}
                          className={`diff-line ${
                            line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : ''
                          }`}
                        >
                          <span className="diff-line-num">{index + 1}</span>
                          <span className="diff-line-content">{line}</span>
                        </div>
                      ))}
                    </pre>
                  </div>

                  {/* Candidate Automated Checks */}
                  {detail.candidate.checks.length > 0 && (
                    <div className="code-checks-section" style={{ marginTop: '16px' }}>
                      <h5>Comprobaciones del parche</h5>
                      <div className="code-checks-grid">
                        {detail.candidate.checks.map((item, index) => (
                          <div key={index} className={`code-check-card ${item.status}`}>
                            <div className="code-check-header">
                              <code>{item.path}</code>
                              <span className={`code-check-badge ${item.status}`}>{checks[item.status]}</span>
                            </div>
                            <p className="code-check-msg">{item.message}</p>
                          </div>
                        ))}
                      </div>
                      <small className="muted block-sub" style={{ marginTop: '8px' }}>
                        Las pruebas unitarias y el build completo de UTAPED no se ejecutan automáticamente en el servidor;
                        la aprobación humana da paso a la creación del PR en develop.
                      </small>
                    </div>
                  )}

                  <div className="drawer-meta-box" style={{ marginTop: '16px' }}>
                    <span className="meta-label">Sello criptográfico de contenido:</span>
                    <code className="meta-value" style={{ wordBreak: 'break-all' }}>
                      {detail.contentHash ?? 'Sin sellar'}
                    </code>
                  </div>
                </div>
              )}

              {/* Agent Verdicts */}
              <div className="drawer-section-card" style={{ marginTop: '16px' }}>
                <div className="section-card-header accent">
                  <div className="section-header-left">
                    <div className="section-icon-badge agent">
                      <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </div>
                    <div>
                      <span className="section-kicker">Evaluaciones Automatizadas</span>
                      <h4 style={{ margin: 0 }}>Dictámenes de los 3 Agentes de IA</h4>
                    </div>
                  </div>
                </div>

                <div className="agent-verdicts-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
                  {detail.messages.map(message => {
                    const verdict =
                      message.stage !== 'executor' && message.output
                        ? (message.output as AgentVerdict)
                        : null;
                    const stageName = stages[message.stage] ?? message.stage;
                    const isSuccess = message.status === 'succeeded';
                    return (
                      <article className="agent-verdict-card" key={message.id}>
                        <header className="agent-verdict-header">
                          <div className="agent-identity-group">
                            <div className={`agent-role-avatar ${message.stage}`}>
                              <Icon
                                path={
                                  message.stage === 'executor'
                                    ? 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
                                    : message.stage === 'reviewer'
                                      ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                                      : 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
                                }
                              />
                            </div>
                            <div>
                              <strong className="agent-role-title">Agente {stageName}</strong>
                              <span className="agent-role-subtitle">
                                {message.stage === 'executor'
                                  ? 'Formulación de parches y planes de corrección'
                                  : message.stage === 'reviewer'
                                    ? 'Revisión estática de código y no regresión'
                                    : 'Comprobación de políticas y criterios de publicación'}
                              </span>
                            </div>
                          </div>

                          <span className={`proposal-status-badge ${isSuccess ? 'executed' : 'rejected'}`}>
                            <Icon
                              path={
                                isSuccess
                                  ? 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'
                                  : 'M18 6L6 18 M6 6l12 12'
                              }
                            />
                            <span>{isSuccess ? 'Superado con éxito' : 'Fallido'}</span>
                          </span>
                        </header>

                        {/* Metadata Bar */}
                        <div className="agent-verdict-meta-bar">
                          <span className="verdict-meta-chip">
                            <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            <span>Modelo: <strong>{message.model}</strong></span>
                          </span>
                          <span className="verdict-meta-chip">
                            <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                            <span>Esfuerzo: <strong>{message.reasoningEffort ? effortLabels[message.reasoningEffort] : 'Predeterminado'}</strong></span>
                          </span>
                          <span className="verdict-meta-chip">
                            <Icon path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <span>Duración: <strong>{message.durationMs !== null ? `${(message.durationMs / 1000).toFixed(1)} s` : '–'}</strong></span>
                          </span>
                        </div>

                        {message.errorCode && (
                          <div className="proposals-error-banner" style={{ padding: '10px 14px', margin: '10px 0' }}>
                            <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <span>{explain(message.errorCode)}</span>
                          </div>
                        )}

                        {verdict && (
                          <div className="agent-verdict-content">
                            {/* Summary Callout */}
                            <div className="verdict-summary-callout">
                              <div className="summary-callout-header">
                                <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                <strong>Dictamen resumido del {stageName}:</strong>
                              </div>
                              <p className="verdict-summary">{verdict.summary}</p>
                            </div>

                            {/* Structured Check Cards */}
                            {verdict.checks.length > 0 && (
                              <div className="verdict-checks-list">
                                <div className="checks-list-header">
                                  <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                  <span>Comprobaciones de validación determinista ({verdict.checks.length})</span>
                                </div>
                                <div className="checks-cards-stack">
                                  {verdict.checks.map((item, idx) => {
                                    const isPass = item.status === 'pass';
                                    return (
                                      <div key={item.code || idx} className={`verdict-check-card ${item.status}`}>
                                        <div className="check-card-badge-col">
                                          <span className={`check-card-badge ${item.status}`}>
                                            <Icon
                                              path={
                                                isPass
                                                  ? 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'
                                                  : 'M18 6L6 18 M6 6l12 12'
                                              }
                                            />
                                            <span>{checks[item.status]}</span>
                                          </span>
                                        </div>
                                        <div className="check-card-body-col">
                                          {item.code && <code className="check-code-pill">{item.code}</code>}
                                          <p className="check-reason-text">{item.reason}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {verdict.issues.length > 0 && (
                              <div className="proposals-error-banner" style={{ margin: '12px 0' }}>
                                <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <div>
                                  <strong>Observaciones señaladas por el {stageName}:</strong>
                                  <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                                    {verdict.issues.map((item, index) => (
                                      <li key={index}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>

              {/* Manager Past Decisions */}
              {detail.decisions.length > 0 && (
                <div className="drawer-section-card" style={{ marginTop: '16px' }}>
                  <h4>Historial de decisiones del Gestor</h4>
                  <div className="decisions-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    {detail.decisions.map(item => (
                      <div className="decision-history-item" key={item.id} style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
                        <div className="decision-item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            className={`proposal-status-badge ${
                              item.decision === 'approved'
                                ? 'authorized'
                                : item.decision === 'rejected'
                                  ? 'rejected'
                                  : 'changes-requested'
                            }`}
                          >
                            <span>
                              {item.decision === 'approved'
                                ? 'Aprobada'
                                : item.decision === 'rejected'
                                  ? 'Rechazada'
                                  : 'Ajustes solicitados'}
                            </span>
                          </span>
                          <span className="decision-date" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            {dates(item.createdAt)}
                          </span>
                        </div>
                        <p className="decision-reason" style={{ margin: '8px 0 0', fontSize: '13px' }}>{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Human Manager Active Decisions Panel */}
              {project.canManageProject && current && (
                <div className="drawer-section-card" style={{ marginTop: '16px', border: '2px solid var(--color-accent)' }}>
                  <header style={{ marginBottom: '14px' }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700 }}>Decisión Humana del Gestor</h4>
                    <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                      El gestor humano tiene la autoridad exclusiva para autorizar, solicitar cambios o rechazar
                      la publicación de este parche en develop.
                    </p>
                  </header>

                  {/* Reason Textarea */}
                  {['pending_human_approval', 'authorized', 'executing', 'execution_failed'].includes(detail.state) && (
                    <div className="editor-field" style={{ marginBottom: '14px' }}>
                      <label htmlFor="code-reason">
                        Motivo de la decisión {detail.state === 'pending_human_approval' ? '(obligatorio)' : ''}
                      </label>
                      <textarea
                        id="code-reason"
                        className="editor-textarea"
                        value={reason}
                        maxLength={1000}
                        rows={3}
                        onChange={event => {
                          setReason(event.target.value);
                          setConfirmDecision(false);
                        }}
                        disabled={busy || running}
                        placeholder="Explica el motivo técnico o de gestión para autorizar, pedir ajustes o rechazar..."
                      />
                      <div className="textarea-footer">
                        <span>{reason.length}/1000</span>
                      </div>
                    </div>
                  )}

                  {/* Actions for PENDING_HUMAN_APPROVAL */}
                  {detail.state === 'pending_human_approval' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <label className="editor-consent-box">
                        <input
                          type="checkbox"
                          checked={confirmDecision}
                          onChange={event => setConfirmDecision(event.target.checked)}
                          disabled={busy || running}
                        />
                        <span>
                          Revisé el diff, las limitaciones y esta versión exacta;{' '}
                          {detail.purpose === 'demonstration'
                            ? 'autorizo únicamente su simulación.'
                            : 'autorizo publicar este diff en una rama y PR hacia develop, sin integrarlo.'}
                        </span>
                      </label>

                      <div className="decision-buttons-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="editor-submit-btn"
                          disabled={busy || running || !confirmDecision || !reason.trim()}
                          onClick={() =>
                            void action(async () => {
                              await post(versionPath + '/decisions', {
                                contentHash: detail.contentHash,
                                decision: 'approved',
                                reason,
                              });
                              setConfirmDecision(false);
                              setNotice('Versión aprobada. La publicación requiere una solicitud separada.');
                            })
                          }
                        >
                          <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                          <span>
                            {detail.purpose === 'demonstration'
                              ? 'Aprobar corrección para simulación'
                              : 'Aprobar corrección para publicación'}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="editor-cancel-btn"
                          disabled={busy || running || !reason.trim()}
                          onClick={() =>
                            void action(async () => {
                              await post(versionPath + '/decisions', {
                                contentHash: detail.contentHash,
                                decision: 'changes_requested',
                                reason,
                              });
                            })
                          }
                        >
                          <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          <span>Solicitar ajustes</span>
                        </button>

                        <button
                          type="button"
                          className="editor-cancel-btn"
                          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                          disabled={busy || running || !reason.trim()}
                          onClick={() =>
                            void action(async () => {
                              await post(versionPath + '/decisions', {
                                contentHash: detail.contentHash,
                                decision: 'rejected',
                                reason,
                              });
                            })
                          }
                        >
                          <Icon path="M18 6L6 18 M6 6l12 12" />
                          <span>Rechazar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions for IN-PROGRESS / INTERRUPTED */}
                  {['draft', 'pending_review', 'pending_policy_check'].includes(detail.state) && !running && (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        type="button"
                        className="editor-submit-btn"
                        disabled={busy || !connected || !consent || !model}
                        onClick={() =>
                          void action(async () => {
                            await post(versionPath + '/resume', providerFields);
                            setConsent(false);
                          })
                        }
                      >
                        <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        <span>Continuar etapa de código pendiente</span>
                      </button>
                    </div>
                  )}

                  {/* Recheck & Withdraw actions */}
                  {['draft', 'pending_review', 'pending_policy_check', 'pending_human_approval', 'authorized', 'executing', 'execution_failed'].includes(
                    detail.state
                  ) && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="editor-cancel-btn"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                        disabled={busy || running}
                        onClick={() =>
                          void action(async () => {
                            setDetail(await post<CodeProposalView>(versionPath + '/recheck', {}, false));
                          })
                        }
                      >
                        <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        <span>Comprobar vigencia del código en GitHub</span>
                      </button>

                      {['pending_human_approval', 'authorized', 'executing', 'execution_failed'].includes(detail.state) && (
                        <button
                          type="button"
                          className="editor-cancel-btn"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          disabled={busy || running || !reason.trim()}
                          onClick={() =>
                            void action(async () => {
                              await post(versionPath + '/withdraw', { reason }, false);
                              setConfirmSimulation(false);
                            })
                          }
                        >
                          <Icon path="M18 6L6 18 M6 6l12 12" />
                          <span>Retirar corrección</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Authorized: Demonstration Simulation */}
                  {detail.state === 'authorized' && detail.purpose === 'demonstration' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                      <label className="editor-consent-box">
                        <input
                          type="checkbox"
                          checked={confirmSimulation}
                          onChange={event => setConfirmSimulation(event.target.checked)}
                          disabled={busy || running}
                        />
                        <span>
                          Quiero registrar una simulación de la rama y del PR de esta versión, sin publicarlos en GitHub.
                        </span>
                      </label>
                      <button
                        type="button"
                        className="editor-submit-btn"
                        disabled={busy || running || !confirmSimulation}
                        onClick={() =>
                          void action(async () => {
                            await post(versionPath + '/simulate-publication', {
                              contentHash: detail.contentHash,
                            });
                            setConfirmSimulation(false);
                            setNotice('Simulación registrada. No se creó ninguna rama, commit ni PR en GitHub.');
                          })
                        }
                      >
                        <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        <span>Simular publicación en GitHub</span>
                      </button>
                    </div>
                  )}

                  {/* Authorized: Live Publication to GitHub */}
                  {detail.state === 'authorized' && detail.purpose === 'live' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                      <label className="editor-consent-box">
                        <input
                          type="checkbox"
                          checked={confirmPublication}
                          disabled={busy || running}
                          onChange={event => setConfirmPublication(event.target.checked)}
                        />
                        <span>
                          Confirmo publicar esta versión exacta en una rama y PR hacia develop; el merge queda
                          pendiente de revisión humana externa.
                        </span>
                      </label>
                      <button
                        type="button"
                        className="editor-submit-btn"
                        disabled={
                          busy ||
                          running ||
                          !confirmPublication ||
                          !overview?.writesEnabled ||
                          !overview.writeCredentialsConfigured
                        }
                        onClick={() =>
                          void action(async () => {
                            await post(versionPath + '/publish', {
                              contentHash: detail.contentHash,
                              confirmed: true,
                            });
                            setConfirmPublication(false);
                            setNotice('Publicación solicitada en GitHub. Consulta la verificación antes de integrar.');
                          })
                        }
                      >
                        <Icon path="M18 15a3 3 0 1 0-2.82-2H15a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H9.82A3 3 0 1 0 9 22a3 3 0 0 0 2.82-2H11a4 4 0 0 0 4-4v-3a4 4 0 0 1 1.17-2.83A3 3 0 0 0 18 15z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                        <span>Publicar rama y Pull Request aprobados</span>
                      </button>
                      {!overview?.writesEnabled && (
                        <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
                          La publicación real está desactivada en este entorno.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
