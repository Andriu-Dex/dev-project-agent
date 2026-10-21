import type {
  CodeProposalView,
} from '@dev-project-agent/contracts';


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

export const stateConfig: Record<string, StateConfigItem> = {
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

export function getStateConfig(state: string): StateConfigItem {
  return stateConfig[state] ?? defaultStateConfig;
}

export const stages: Record<string, string> = {
  executor: 'Ejecutor',
  reviewer: 'Revisor',
  approver: 'Aprobador',
};

export const categories: Record<string, string> = {
  correctness: 'Corrección funcional',
  security: 'Seguridad',
  duplication: 'Duplicación',
  maintainability: 'Mantenibilidad',
  complexity: 'Complejidad',
  performance: 'Rendimiento',
};

export const severityLabels: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const checks: Record<string, string> = {
  pass: 'Superada',
  fail: 'No superada',
  not_checked: 'No comprobada',
};

export const errors: Record<string, string> = {
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

export const explain = (code: string) => {
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

export const dates = (value: string | null) =>
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

export async function read<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'No se pudo consultar el estado.');
  return body as T;
}

export function downloadPatch(detail: CodeProposalView) {
  if (!detail.candidate) return;
  const url = URL.createObjectURL(new Blob([detail.candidate.patch], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `proposal-${detail.id}-v${detail.version}.patch`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function splitGoal(goal: string): { title: string; description: string } {
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
