import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentVerdict,
  ProjectAccess,
  ProposalOverview,
  ProposalState,
  ProposalVersionView,
  ProviderOverview,
  ReasoningEffort,
  SupervisionOverview,
  TrelloOverview,
  TrackingPolicyResponse,
  TrelloAction,
} from '@dev-project-agent/contracts';
import { AgentModelSelect } from './AgentModelSelect';
import { readAgentProviders, providerDestination } from './agentProviders';
import { ExecutionPanel } from './ExecutionPanel';
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

const stateConfig: Record<ProposalState, StateConfigItem> = {
  draft: {
    label: 'Preparando propuesta',
    badgeClass: 'draft',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  pending_review: {
    label: 'Revisión pendiente',
    badgeClass: 'in-review',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  in_review: {
    label: 'Revisando propuesta',
    badgeClass: 'in-review',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  pending_policy_check: {
    label: 'Comprobación de política',
    badgeClass: 'in-review',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  in_policy_check: {
    label: 'Comprobando política',
    badgeClass: 'in-review',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
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
    label: 'Ejecutando en Trello',
    badgeClass: 'executing',
    icon: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83',
  },
  executed: {
    label: 'Cambio verificado en Trello',
    badgeClass: 'executed',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  },
  execution_failed: {
    label: 'Ejecución fallida',
    badgeClass: 'failed',
    icon: 'M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  },
  reconciliation_required: {
    label: 'Reconciliación pendiente',
    badgeClass: 'reconciliation',
    icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
};

function getStateConfig(state: ProposalState): StateConfigItem {
  return stateConfig[state] ?? defaultStateConfig;
}

const stages: Record<string, string> = {
  executor: 'Ejecutor',
  reviewer: 'Revisor',
  approver: 'Aprobador',
};

const verdicts: Record<string, { label: string; badgeClass: string }> = {
  validated: { label: 'Validada', badgeClass: 'pass' },
  human_required: { label: 'Requiere decisión del gestor', badgeClass: 'warning' },
  changes_requested: { label: 'Solicita ajustes', badgeClass: 'changes' },
  rejected: { label: 'Rechaza', badgeClass: 'fail' },
};

const checkLabels: Record<string, string> = {
  evidence: 'Evidencia citada',
  scope: 'Alcance delimitado',
  preconditions: 'Valores previos coincidentes',
  risks: 'Riesgos evaluados',
  verification: 'Plan de verificación',
  manager_only: 'Autoridad exclusiva del gestor',
  single_card: 'Una sola tarjeta afectada',
  no_execution: 'Ausencia de ejecución directa',
};

const failures: Record<string, string> = {
  USAGE_LIMIT: 'Se alcanzó un límite de cuota; no se reintenta automáticamente.',
  SERVICE_RESTARTED: 'El servicio se reinició. Puedes continuar la etapa pendiente.',
  FORBIDDEN: 'El gestor perdió los permisos necesarios en este proyecto.',
  SOURCE_CHANGED: 'Cambió la fuente oficial o la lectura venció. Se necesita una nueva versión.',
  BLOCKING_QUESTIONS: 'La respuesta dejó preguntas bloqueantes sin resolver.',
  CONNECTION_REQUIRED: 'Conecta el proveedor de IA para continuar.',
  INVALID_AGENT_OUTPUT: 'La respuesta del modelo no cumple el formato estructurado exigido.',
  INVALID_SCOPE: 'La respuesta propuso acciones fuera del alcance delimitado.',
  INVALID_EVIDENCE: 'La respuesta citó evidencia no encontrada en el corte.',
  INVALID_AGENT_VERDICT: 'El dictamen del agente no respeta el flujo de autorización.',
  BLOCKING_CHECK: 'Hay comprobaciones obligatorias sin superar.',
  HASH_MISMATCH: 'El dictamen corresponde a otro contenido o versión.',
};

const date = (value: string | null) =>
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

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) throw new Error('No se pudo consultar el flujo de propuestas.');
  return response.json() as Promise<T>;
}

function verdict(value: unknown): AgentVerdict | null {
  return value && typeof value === 'object' && 'verdict' in value ? (value as AgentVerdict) : null;
}

function getProposalStepIndex(state: ProposalState): number {
  switch (state) {
    case 'draft':
      return 1;
    case 'pending_review':
    case 'in_review':
      return 2;
    case 'pending_policy_check':
    case 'in_policy_check':
      return 3;
    case 'pending_human_approval':
    case 'changes_requested':
    case 'rejected':
    case 'invalidated':
      return 4;
    case 'authorized':
    case 'executing':
    case 'executed':
    case 'execution_failed':
    case 'reconciliation_required':
      return 5;
    default:
      return 0;
  }
}

function ActionSummary({ action, members }: { action: TrelloAction; members: { id: string; displayName: string }[] }) {
  const names = (ids: string[]) =>
    ids.map(id => members.find(member => member.id === id)?.displayName ?? id).join(', ') || 'Sin asignar';

  if (action.type === 'trello_members_change') {
    return (
      <div className="proposal-change-comparison">
        <div className="comparison-box before">
          <span className="comparison-label">Asignados actuales</span>
          <p className="comparison-value">{names(action.expectedMembers)}</p>
        </div>
        <div className="comparison-arrow">
          <Icon path="M13 7l5 5m0 0l-5 5m5-5H6" />
        </div>
        <div className="comparison-box after">
          <span className="comparison-label">Asignados propuestos</span>
          <p className="comparison-value proposed">{names(action.proposedMembers)}</p>
        </div>
      </div>
    );
  }

  if (action.type === 'trello_priority_change' || action.type === 'trello_state_change') {
    return (
      <div className="proposal-change-comparison">
        <div className="comparison-box before">
          <span className="comparison-label">Etiquetas actuales</span>
          <p className="comparison-value">{action.expectedLabels.join(', ') || 'Sin etiquetas'}</p>
          <small className="comparison-sub">
            Finalización: {action.expectedDueComplete ? 'Declarada' : 'No declarada'}
          </small>
        </div>
        <div className="comparison-arrow">
          <Icon path="M13 7l5 5m0 0l-5 5m5-5H6" />
        </div>
        <div className="comparison-box after">
          <span className="comparison-label">Etiquetas propuestas</span>
          <p className="comparison-value proposed">{action.proposedLabels.join(', ') || 'Sin etiquetas'}</p>
          <small className="comparison-sub">
            Finalización: {action.proposedDueComplete ? 'Declarada' : 'No declarada'}
          </small>
        </div>
      </div>
    );
  }

  if (!('expectedDue' in action)) return null;

  return (
    <div className="proposal-change-comparison">
      <div className="comparison-box before">
        <span className="comparison-label">Vencimiento actual esperado</span>
        <p className="comparison-value">{date(action.expectedDue)}</p>
        {action.type === 'trello_dates_change' && (
          <small className="comparison-sub">Inicio: {date(action.expectedStart)}</small>
        )}
      </div>
      <div className="comparison-arrow">
        <Icon path="M13 7l5 5m0 0l-5 5m5-5H6" />
      </div>
      <div className="comparison-box after">
        <span className="comparison-label">Vencimiento propuesto</span>
        <p className="comparison-value proposed">{date(action.proposedDue)}</p>
        {action.type === 'trello_dates_change' && (
          <small className="comparison-sub">Inicio: {date(action.proposedStart)}</small>
        )}
      </div>
    </div>
  );
}

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

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selection) {
        setSelection(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection]);

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
        <section className="proposal-editor-card">
          <div className="editor-card-header">
            <div className="editor-header-title">
              <div className="editor-icon-badge">
                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </div>
              <div>
                <h3>{adjusting ? `Ajustar propuesta (Nueva versión v${(detail?.version ?? 1) + 1})` : 'Preparar nueva propuesta de cambio'}</h3>
                <p>
                  {adjusting
                    ? 'Formula una versión corregida resolviendo las observaciones del gestor o los agentes.'
                    : 'Delimita una propuesta sobre una tarjeta de Trello para que los 3 agentes la formulen y comprueben.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="editor-close-btn"
              onClick={() => {
                setShowEditor(false);
                setAdjustment(null);
                setConsent(false);
              }}
              title="Cerrar formulario"
            >
              <Icon path="M18 6L6 18 M6 6l12 12" />
            </button>
          </div>

          <div className="editor-card-body">
            {!connected && (
              <div className="editor-warning-box">
                <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <span>Conecta ChatGPT o inicia Ollama en Configuración para iniciar la orquestación de agentes.</span>
              </div>
            )}

            {!sources?.supervision.latestRun && (
              <div className="editor-warning-box">
                <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
                <span>Primero actualiza las fuentes y ejecuta una supervisión en la pantalla de Operación.</span>
              </div>
            )}

            <div className="editor-grid">
              {/* Purpose Selection */}
              <div className="editor-field">
                <label htmlFor="proposal-purpose">Propósito de la propuesta</label>
                <select
                  id="proposal-purpose"
                  value={adjusting ? detail!.purpose : purpose}
                  disabled={busy || active || adjusting}
                  onChange={event => {
                    setPurpose(event.target.value as typeof purpose);
                    setConsent(false);
                  }}
                  className="editor-select"
                >
                  <option value="demonstration">Demostración (sin cambios en Trello)</option>
                  <option value="live">Uso real (puede solicitar ejecución tras aprobación)</option>
                </select>
                <small className="editor-hint">
                  El propósito se conserva en todas las versiones y no se puede convertir una demostración en real.
                </small>
              </div>

              {/* Target Card */}
              <div className="editor-field">
                <label htmlFor="proposal-card">Tarjeta de Trello a revisar</label>
                <select
                  id="proposal-card"
                  value={cardId}
                  onChange={event => {
                    setCardId(event.target.value);
                    setConsent(false);
                  }}
                  disabled={busy || active || adjusting}
                  className="editor-select"
                >
                  {cards.map(card => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
                <small className="editor-hint">
                  Valores leídos: Inicio: <strong>{date(selectedCard?.start ?? null)}</strong> · Vencimiento:{' '}
                  <strong>{date(selectedCard?.due ?? null)}</strong>
                </small>
              </div>

              {/* Adjustment Family */}
              <div className="editor-field">
                <label htmlFor="proposal-family">Tipo de ajuste solicitado</label>
                <select
                  id="proposal-family"
                  value={family}
                  disabled={busy || active}
                  onChange={event => {
                    setFamily(event.target.value);
                    setLabel('');
                    setConsent(false);
                  }}
                  className="editor-select"
                >
                  <option value="due">Vencimiento</option>
                  <option value="dates">Inicio y vencimiento</option>
                  <option value="priority">Prioridad</option>
                  <option value="members">Responsables asignados</option>
                  <option value="state">Estado declarado</option>
                </select>
              </div>

              {/* Family Specific Inputs */}
              {family === 'dates' && (
                <div className="editor-field">
                  <label htmlFor="proposal-start">Nuevo inicio (hora local)</label>
                  <input
                    id="proposal-start"
                    type="datetime-local"
                    value={start}
                    disabled={busy || active}
                    onChange={event => {
                      setStart(event.target.value);
                      setConsent(false);
                    }}
                    className="editor-input"
                  />
                </div>
              )}

              {isDate && (
                <div className="editor-field">
                  <label htmlFor="proposal-due">Nueva fecha objetivo (hora local)</label>
                  <input
                    id="proposal-due"
                    type="datetime-local"
                    value={due}
                    onChange={event => {
                      setDue(event.target.value);
                      setConsent(false);
                    }}
                    disabled={busy || active}
                    className="editor-input"
                  />
                  {due && Number.isFinite(new Date(due).getTime()) && (
                    <small className="editor-hint">
                      En Ecuador: <strong>{date(new Date(due).toISOString())}</strong>. Es una propuesta de planificación.
                    </small>
                  )}
                  {dateProblem && <p className="editor-field-error">{dateProblem}</p>}
                </div>
              )}

              {(family === 'priority' || family === 'state') && (
                <div className="editor-field">
                  <label htmlFor="proposal-label">Etiqueta configurada propuesta</label>
                  <select
                    id="proposal-label"
                    value={label}
                    disabled={busy || active}
                    onChange={event => {
                      setLabel(event.target.value);
                      setConsent(false);
                    }}
                    className="editor-select"
                  >
                    <option value="">Seleccionar etiqueta configurada…</option>
                    {Object.keys((family === 'priority' ? policy?.priorityLabels : policy?.stateLabels) ?? {}).map(
                      value => (
                        <option key={value}>{value}</option>
                      )
                    )}
                  </select>
                  <small className="editor-hint">Se conservan las etiquetas ajenas a esta familia.</small>
                </div>
              )}
            </div>

            {family === 'members' && (
              <div className="editor-members-section">
                <label className="editor-section-label">Integrantes asignados propuestos</label>
                <div className="editor-members-grid">
                  {sources?.trello.latest?.data.members.map(member => (
                    <label key={member.id} className="editor-member-pill">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(member.id)}
                        disabled={busy || active}
                        onChange={event => {
                          setMemberIds(ids =>
                            event.target.checked ? [...ids, member.id] : ids.filter(id => id !== member.id)
                          );
                          setConsent(false);
                        }}
                      />
                      <span>{member.displayName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Goal Textarea */}
            <div className="editor-field full-width">
              <label htmlFor="proposal-goal">Objetivo y justificación del cambio</label>
              <textarea
                id="proposal-goal"
                maxLength={1000}
                value={goal}
                onChange={event => {
                  setGoal(event.target.value);
                  setConsent(false);
                }}
                disabled={busy || active}
                placeholder="Explica detalladamente la propuesta, motivos técnicos o acuerdos de equipo sin incluir credenciales ni datos personales…"
                rows={3}
                className="editor-textarea"
              />
              <div className="textarea-footer">
                <span>{goal.length} / 1000 caracteres</span>
              </div>
            </div>

            {/* Provider, Model & Reasoning */}
            <div className="editor-model-row">
              <AgentModelSelect
                id="proposal-model"
                models={provider?.connection.models ?? []}
                value={model}
                onChange={value => {
                  setModel(value);
                  setEffort('');
                  setConsent(false);
                }}
                disabled={busy || active}
              />
              <ReasoningSelect
                id="proposal-effort"
                model={selectedModel}
                value={effort}
                onChange={value => {
                  setEffort(value);
                  setConsent(false);
                }}
                disabled={busy || active}
              />
            </div>

            {/* Consent Checkbox */}
            <label className="editor-consent-box">
              <input
                type="checkbox"
                checked={consent}
                onChange={event => setConsent(event.target.checked)}
                disabled={busy || active}
              />
              <span>
                Quiero enviar a <strong>{providerDestination(model)}</strong> el objetivo, los identificadores, nombre,
                estado, fechas, WBS, etiquetas y asignados de esta tarjeta para la orquestación secuencial de los 3
                agentes.
              </span>
            </label>

            {/* Action Buttons */}
            <div className="editor-actions-row">
              {adjusting && (
                <button
                  type="button"
                  className="editor-cancel-btn"
                  disabled={busy || active}
                  onClick={() => {
                    setAdjustment(null);
                    setConsent(false);
                    setShowEditor(false);
                  }}
                >
                  Cancelar ajuste
                </button>
              )}

              <button
                type="button"
                className="editor-submit-btn"
                disabled={
                  busy ||
                  active ||
                  !connected ||
                  !model ||
                  !consent ||
                  !goal.trim() ||
                  (isDate && !due) ||
                  (family === 'dates' && !start) ||
                  (family === 'members' && !memberIds.length) ||
                  (['priority', 'state'].includes(family) && !label) ||
                  Boolean(dateProblem) ||
                  !cardId ||
                  !sources?.supervision.latestRun
                }
                onClick={() => void prepare()}
              >
                {active ? (
                  <>
                    <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
                    <span>Agentes en ejecución…</span>
                  </>
                ) : adjusting ? (
                  <>
                    <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    <span>Preparar nueva versión</span>
                  </>
                ) : (
                  <>
                    <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                    <span>Iniciar los 3 agentes en secuencia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Modern Filter Panel */}
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

      {/* Proposals List Container */}
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

      {/* Slide-over Detail Drawer */}
      {detail && (() => {
        const detailSt = getStateConfig(detail.state);
        const currentStepIndex = getProposalStepIndex(detail.state);

        return (
          <div
            className="proposals-drawer-backdrop"
            onClick={() => setSelection(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-drawer-title"
          >
            <aside className="proposals-detail-drawer" onClick={e => e.stopPropagation()}>
              <header className="drawer-header">
                <div className="drawer-header-meta">
                  <span className={'proposal-status-badge ' + detailSt.badgeClass}>
                    <Icon path={detailSt.icon} />
                    <span>{detailSt.label}</span>
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
                    <label htmlFor="proposal-version-select">Versión:</label>
                    <select
                      id="proposal-version-select"
                      value={detail.version}
                      onChange={event =>
                        setSelection({
                          id: detail.proposalId,
                          version: Number(event.target.value),
                        })
                      }
                      className="drawer-version-select"
                    >
                      {Array.from({ length: latest?.version ?? detail.version }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          v{index + 1}
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

              <div className="drawer-scroll-body">
                <div className="drawer-title-area">
                  <h3 id="proposal-drawer-title">{detail.context.card.name}</h3>
                  <p className="drawer-submessage">
                    Propuesta creada el <strong>{date(detail.createdAt)}</strong> · Corte de supervisión:{' '}
                    <code>{detail.sourceRunId}</code>
                  </p>
                </div>

                {/* Proposal Journey / Stepper */}
                <div className="proposal-journey-container">
                  <div className="proposal-stepper">
                    {[
                      { step: 1, label: '1. Solicitud' },
                      { step: 2, label: '2. Ejecutor' },
                      { step: 3, label: '3. Revisor' },
                      { step: 4, label: '4. Aprobador' },
                      { step: 5, label: '5. Decisión del gestor' },
                      { step: 6, label: '6. Ejecución' },
                    ].map(s => {
                      const isDone = currentStepIndex > s.step;
                      const isCurrent = currentStepIndex === s.step;
                      return (
                        <div
                          key={s.step}
                          className={
                            'stepper-step' +
                            (isDone ? ' is-done' : '') +
                            (isCurrent ? ' is-current' : '')
                          }
                        >
                          <span className="stepper-dot">
                            {isDone ? '✓' : s.step}
                          </span>
                          <span className="stepper-label">{s.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="drawer-content-flow">
                {/* Proposed Change Section */}
                {detail.content && (
                  <section className="drawer-section-card">
                    <div className="section-card-header accent">
                      <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      <h4>Objetivo y Cambio Formulado</h4>
                    </div>

                    <div className="proposal-objective-box">
                      <strong className="objective-title">{detail.content.objective}</strong>
                      <p className="objective-justification">{detail.content.justification}</p>
                    </div>

                    {detail.content.actions[0] && (
                      <ActionSummary
                        action={detail.content.actions[0]}
                        members={sources?.trello.latest?.data.members ?? []}
                      />
                    )}

                    <div className="proposal-impact-box">
                      <span className="block-label">Impacto proyectado</span>
                      <p>{detail.content.impact}</p>
                    </div>

                    {detail.content.alternatives.length > 0 && (
                      <div className="drawer-meta-list-block">
                        <span className="block-label">Alternativas consideradas por el agente</span>
                        <ul>
                          {detail.content.alternatives.map((val, idx) => (
                            <li key={idx}>{val}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {detail.content.risks.length > 0 && (
                      <div className="drawer-meta-list-block">
                        <span className="block-label">Riesgos identificados</span>
                        <ul>
                          {detail.content.risks.map((val, idx) => (
                            <li key={idx}>{val}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="drawer-card-meta-grid">
                      <div className="drawer-meta-box">
                        <span className="meta-box-label">Verificación prevista</span>
                        <p className="meta-box-value">{detail.content.verificationPlan}</p>
                      </div>
                      <div className="drawer-meta-box">
                        <span className="meta-box-label">Recuperación prevista</span>
                        <p className="meta-box-value">{detail.content.recoveryPlan}</p>
                      </div>
                    </div>

                    {detail.content.unresolvedQuestions.length > 0 && (
                      <div className="drawer-section-card warning">
                        <div className="section-card-header">
                          <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <h4>Preguntas pendientes sin resolver</h4>
                        </div>
                        <ul className="drawer-issues-list">
                          {detail.content.unresolvedQuestions.map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <details className="evidence-accordion">
                      <summary>Evidencia citada y huella criptográfica</summary>
                      <div className="evidence-accordion-content">
                        <p>
                          <strong>Evidencia citada:</strong> {detail.content.evidenceIds.join(', ') || 'Ninguna'}
                        </p>
                        <p className="content-hash">
                          <strong>Hash de contenido:</strong> <code>{detail.contentHash}</code>
                        </p>
                        <p>
                          <strong>Tarjeta Trello:</strong> <code>{detail.context.card.id}</code>
                        </p>
                      </div>
                    </details>
                  </section>
                )}

                {/* Agent Verdicts & History */}
                <section className="drawer-section-card">
                  <div className="section-card-header">
                    <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    <h4>Dictámenes de los 3 Agentes</h4>
                  </div>

                  <div className="agent-verdicts-stack">
                    {detail.messages.map(message => {
                      const review = verdict(message.output);
                      const job = overview?.jobs.find(j => j.id === message.jobId);
                      const stageLabel = stages[message.stage] ?? message.stage;
                      const vInfo = review ? verdicts[review.verdict] : null;

                      return (
                        <div key={message.id} className="agent-verdict-box">
                          <div className="verdict-box-header">
                            <div className="verdict-agent-title">
                              <strong>Agente {stageLabel}</strong>
                              <span
                                className={
                                  'stage-status-badge ' +
                                  (message.status === 'succeeded' ? 'success' : 'failed')
                                }
                              >
                                {message.status === 'succeeded' ? 'Completado' : 'No completado'}
                              </span>
                            </div>

                            <span className="verdict-meta-date">{date(message.createdAt)}</span>
                          </div>

                          <div className="verdict-meta-subline">
                            {job && (
                              <span>
                                Modelo: <strong>{job.model}</strong> · Razonamiento:{' '}
                                <strong>{job.reasoningEffort ? effortLabels[job.reasoningEffort] : 'Predeterminado'}</strong>
                              </span>
                            )}
                            {message.durationMs !== null && (
                              <span> · {(message.durationMs / 1000).toFixed(1)} s</span>
                            )}
                            {message.usage?.total_tokens !== undefined && (
                              <span> · {message.usage.total_tokens} tokens</span>
                            )}
                          </div>

                          {message.errorCode && (
                            <p className="form-error">
                              {failures[message.errorCode] ??
                                'La etapa no terminó. Revisa la conexión y consulta el estado.'}
                            </p>
                          )}

                          {review && (
                            <div className="verdict-evaluation-body">
                              <div className="verdict-summary-line">
                                <span className={'verdict-pill ' + (vInfo?.badgeClass ?? 'pass')}>
                                  {vInfo?.label ?? review.verdict}
                                </span>
                                <p className="verdict-summary-text">{review.summary}</p>
                              </div>

                              <ul className="verdict-checks-list">
                                {review.checks.map(check => (
                                  <li key={check.code} className={'check-item ' + check.status}>
                                    <span className="check-status-icon">
                                      {check.status === 'pass' ? '✓' : check.status === 'fail' ? '✕' : '—'}
                                    </span>
                                    <span>
                                      <strong>{checkLabels[check.code] ?? check.code}:</strong> {check.reason}
                                    </span>
                                  </li>
                                ))}
                              </ul>

                              {review.issues.length > 0 && (
                                <ul className="verdict-issues-list">
                                  {review.issues.map((issue, idx) => (
                                    <li key={idx}>{issue}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Human Manager Decision Zone */}
                {project.canManageProject && isLatest && !active && (
                  <section className="drawer-section-card manager-decision-zone">
                    <div className="section-card-header manager">
                      <Icon path="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <h4>Decisión del Gestor (Control Humano)</h4>
                    </div>

                    {detail.state === 'pending_human_approval' && (
                      <div className="decision-form-container">
                        <p className="decision-notice">
                          Los 3 agentes completaron sus revisiones. Para que esta propuesta sea válida, registra tu
                          decisión fundamentada:
                        </p>

                        <div className="form-field">
                          <label htmlFor="proposal-reason">
                            Motivo o justificación de la decisión <span>(obligatorio)</span>
                          </label>
                          <textarea
                            id="proposal-reason"
                            maxLength={1000}
                            required
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            disabled={busy}
                            placeholder="Explica las razones técnicas, de equipo o estratégicas de tu decisión…"
                            rows={3}
                          />
                        </div>

                        <label className="decision-confirm-checkbox">
                          <input
                            type="checkbox"
                            checked={confirm}
                            onChange={e => setConfirm(e.target.checked)}
                            disabled={busy}
                          />
                          <span>
                            {detail.purpose === 'demonstration'
                              ? 'He revisado esta versión y registro una aprobación de demostración (sin cambios en Trello).'
                              : 'He revisado esta versión y autorizo el cambio propuesto. La ejecución a Trello se solicitará por separado.'}
                          </span>
                        </label>

                        <div className="decision-buttons-row">
                          <button
                            type="button"
                            className="decision-btn approve"
                            disabled={busy || !confirm || !reason.trim()}
                            onClick={() => decide('approved')}
                          >
                            <Icon path="M5 13l4 4L19 7" />
                            <span>Aprobar esta versión</span>
                          </button>

                          <button
                            type="button"
                            className="decision-btn request-changes"
                            disabled={busy || !reason.trim()}
                            onClick={() => decide('changes_requested')}
                          >
                            <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                            <span>Solicitar ajustes</span>
                          </button>

                          <button
                            type="button"
                            className="decision-btn reject"
                            disabled={busy || !reason.trim()}
                            onClick={() => decide('rejected')}
                          >
                            <Icon path="M18 6L6 18 M6 6l12 12" />
                            <span>Rechazar propuesta</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {!['rejected', 'changes_requested', 'invalidated', 'executing', 'executed', 'reconciliation_required'].includes(detail.state) && (
                      <div className="recheck-container">
                        <button
                          type="button"
                          className="recheck-btn"
                          disabled={busy}
                          onClick={() => void mutate(detailPath + '/recheck', null)}
                        >
                          <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          <span>Comprobar vigencia de la propuesta frente a Trello</span>
                        </button>
                      </div>
                    )}

                    {['draft', 'pending_review', 'pending_policy_check'].includes(detail.state) && (
                      <div className="resume-container">
                        <p className="resume-hint">
                          El proceso se interrumpió; puedes continuar la etapa pendiente utilizando el modelo seleccionado:
                        </p>
                        <label className="editor-consent-box">
                          <input
                            type="checkbox"
                            checked={resumeConsent}
                            onChange={event => setResumeConsent(event.target.checked)}
                            disabled={busy}
                          />
                          <span>
                            Quiero reenviar a <strong>{providerDestination(model)}</strong> el contexto y contenido de
                            esta versión para continuar su revisión.
                          </span>
                        </label>
                        <button
                          type="button"
                          className="resume-submit-btn"
                          disabled={busy || !connected || !model || !resumeConsent}
                          onClick={() =>
                            void mutate(
                              detailPath + '/resume',
                              { model, ...(effort ? { reasoningEffort: effort } : {}) },
                              () => {
                                setResumeConsent(false);
                                setNotice('Etapa pendiente iniciada.');
                              }
                            )
                          }
                        >
                          <Icon path="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <span>Continuar etapa pendiente</span>
                        </button>
                      </div>
                    )}

                    {canAdjust && (
                      <div className="adjust-container">
                        <button
                          type="button"
                          className="adjust-btn"
                          disabled={busy}
                          onClick={() => {
                            setAdjustment({ id: detail.proposalId, version: detail.version });
                            setCardId(detail.context.card.id);
                            setGoal(detail.goal);
                            const action = detail.content?.actions[0];
                            const local = (value: string) => {
                              const time = new Date(value);
                              time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
                              return time.toISOString().slice(0, 16);
                            };
                            if (action?.type === 'trello_dates_change') {
                              setFamily('dates');
                              setStart(local(action.proposedStart??''));
                              setDue(local(action.proposedDue??''));
                            } else if (action?.type === 'trello_members_change') {
                              setFamily('members');
                              setMemberIds(action.proposedMembers);
                            } else if (
                              action?.type === 'trello_priority_change' ||
                              action?.type === 'trello_state_change'
                            ) {
                              setFamily(action.type === 'trello_priority_change' ? 'priority' : 'state');
                              setLabel('');
                            } else {
                              setFamily('due');
                              if (detail.requestedDue) setDue(local(detail.requestedDue));
                            }
                            setConsent(false);
                            setShowEditor(true);
                            setSelection(null);
                          }}
                        >
                          <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          <span>Usar esta propuesta como base del ajuste (v{(detail.version ?? 1) + 1})</span>
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* Execution Panel in Trello */}
                <ExecutionPanel
                  key={`${detail.proposalId}:${detail.version}`}
                  project={project}
                  csrfToken={csrfToken}
                  proposal={detail}
                  isLatest={isLatest}
                  onChanged={() => {
                    setNotice('');
                    setRevision(value => value + 1);
                  }}
                />

                {/* Historical Decisions */}
                {detail.decisions.length > 0 && (
                  <section className="drawer-section-card">
                    <div className="section-card-header">
                      <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
                      <h4>Historial de Decisiones del Gestor</h4>
                    </div>

                    <div className="decisions-history-list">
                      {detail.decisions.map(d => (
                        <div key={d.id} className={'decision-history-item ' + d.decision}>
                          <div className="decision-history-header">
                            <span className={'decision-pill ' + d.decision}>
                              {d.decision === 'approved'
                                ? 'Aprobada'
                                : d.decision === 'rejected'
                                  ? 'Rechazada'
                                  : 'Ajustes solicitados'}
                            </span>
                            <span className="decision-timestamp">{date(d.createdAt)}</span>
                          </div>
                          <p className="decision-reason-text">«{d.reason || 'Sin observaciones adicionales.'}»</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                </div>
              </div>
            </aside>
          </div>
        );
      })()}
    </div>
  );
}
