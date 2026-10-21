import type {
  AgentVerdict,
  ProposalState,
  TrelloAction,
} from '@dev-project-agent/contracts';
import { Icon } from './Workspace';


export interface StateConfigItem {
  label: string;
  badgeClass: string;
  icon: string;
}

export const defaultStateConfig: StateConfigItem = {
  label: 'En proceso',
  badgeClass: 'in-review',
  icon: 'M12 8v4 M12 16h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
};

export const stateConfig: Record<ProposalState, StateConfigItem> = {
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

export function getStateConfig(state: ProposalState): StateConfigItem {
  return stateConfig[state] ?? defaultStateConfig;
}

export const stages: Record<string, string> = {
  executor: 'Ejecutor',
  reviewer: 'Revisor',
  approver: 'Aprobador',
};

export const verdicts: Record<string, { label: string; badgeClass: string }> = {
  validated: { label: 'Validada', badgeClass: 'pass' },
  human_required: { label: 'Requiere decisión del gestor', badgeClass: 'warning' },
  changes_requested: { label: 'Solicita ajustes', badgeClass: 'changes' },
  rejected: { label: 'Rechaza', badgeClass: 'fail' },
};

export const checkLabels: Record<string, string> = {
  evidence: 'Evidencia citada',
  scope: 'Alcance delimitado',
  preconditions: 'Valores previos coincidentes',
  risks: 'Riesgos evaluados',
  verification: 'Plan de verificación',
  manager_only: 'Autoridad exclusiva del gestor',
  single_card: 'Una sola tarjeta afectada',
  no_execution: 'Ausencia de ejecución directa',
};

export const failures: Record<string, string> = {
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

export const date = (value: string | null) =>
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

export async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) throw new Error('No se pudo consultar el flujo de propuestas.');
  return response.json() as Promise<T>;
}

export function verdict(value: unknown): AgentVerdict | null {
  return value && typeof value === 'object' && 'verdict' in value ? (value as AgentVerdict) : null;
}

export function getProposalStepIndex(state: ProposalState): number {
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

export function ActionSummary({ action, members }: { action: TrelloAction; members: { id: string; displayName: string }[] }) {
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
