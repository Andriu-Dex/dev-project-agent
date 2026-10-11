import type { AttentionLevel, ItemTracking, TrelloItem, TrelloOverview, TrackingFinding, TrackingResponse } from '@dev-project-agent/contracts';

export interface TrackingPolicy {
  version: string;
  dueSoonHours: number;
  staleAfterMinutes: number;
  thresholdsConfirmed: boolean;
  priorityLabels: Record<string, 'high' | 'medium' | 'low'>;
  blockedLabels: string[];
}
const hour = 3_600_000;
const rank: Record<AttentionLevel, number> = { immediate: 3, upcoming: 2, review: 1, none: 0 };
const date = (value: string | null): number | null => {
  if (!value) return null;
  // Dates without an explicit offset are not interpreted using the server's timezone.
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

function checkPolicy(policy: TrackingPolicy) {
  if (!policy.version || !Number.isFinite(policy.dueSoonHours) || policy.dueSoonHours <= 0 ||
    !Number.isFinite(policy.staleAfterMinutes) || policy.staleAfterMinutes <= 0) throw new Error('Invalid tracking policy.');
}

export function evaluateTracking(overview: TrelloOverview, evaluatedAt: Date, policy: TrackingPolicy): TrackingResponse {
  checkPolicy(policy);
  const now = evaluatedAt.getTime();
  if (!Number.isFinite(now)) throw new Error('Invalid evaluation date.');
  const result: TrackingResponse = {
    evaluatedAt: evaluatedAt.toISOString(),
    policy: { version: policy.version, dueSoonHours: policy.dueSoonHours, staleAfterMinutes: policy.staleAfterMinutes, thresholdsConfirmed: policy.thresholdsConfirmed },
    source: null, summary: null, items: [], findings: [],
    limitations: ['Los estados son declaraciones del tablero, no aceptación verificada.',
      'Esta evaluación de fechas no calcula causas, probabilidades ni ruta crítica. Las dependencias explícitas se revisan en la supervisión guardada.',
      'La evaluación utiliza una lectura guardada y no consulta Trello.'],
  };
  if (!policy.thresholdsConfirmed) result.limitations.push('Los umbrales son valores iniciales propuestos, pendientes de confirmación.');
  if (!policy.blockedLabels.length) result.limitations.push('No hay un mapeo de bloqueo acordado: ausencia de datos no significa ausencia de bloqueo.');
  if (!Object.keys(policy.priorityLabels).length) result.limitations.push('La prioridad no está informada; no se infiere de colores, listas o urgencia.');
  const latest = overview.latest;
  if (!latest) { result.limitations.push('No hay una lectura válida para evaluar.'); return result; }
  const observedAt = date(latest.observedAt);
  const validSourceDate = observedAt !== null && observedAt <= now;
  const ageMinutes = validSourceDate ? (now - observedAt!) / 60_000 : 0;
  const freshness = !validSourceDate ? 'invalid' : latest.source === 'export' ? 'historical' : ageMinutes >= policy.staleAfterMinutes ? 'stale' : 'recent';
  result.source = { snapshotId: latest.id, source: latest.source, observedAt: latest.observedAt, ageMinutes, freshness,
    lastAttemptFailed: overview.lastAttempt?.status === 'failed' };
  if (freshness !== 'recent') result.limitations.push('La fuente es histórica, desactualizada o tiene una fecha inválida. Los hallazgos no acreditan el estado actual de Trello.');

  const operational = latest.data.items.filter(item => !item.archived && item.kind !== 'reference');
  for (const item of operational) {
    const tracking = evaluateItem(item, now, policy, validSourceDate);
    result.items.push(tracking);
    const evidence: TrackingFinding['evidence'] = [
      { field: 'state', value: item.state }, { field: 'due', value: item.due }, { field: 'dueComplete', value: item.dueComplete },
    ];
    function finding(code: TrackingFinding['code'], attention: AttentionLevel, message: string, facts = evidence) {
      result.findings.push({ id: `${latest!.id}:${item.id}:${code}`, itemId: item.id, itemName: item.name,
        kind: item.kind as 'activity' | 'milestone', code, attention, message, evidence: facts, impact: 'not_assessed' });
    }
    if (tracking.schedule === 'overdue') finding('overdue', 'immediate', 'En la lectura guardada, el elemento no está completado y su vencimiento es anterior a la evaluación.');
    if (tracking.schedule === 'due_soon') finding('due_soon', tracking.blocked ? 'immediate' : 'upcoming', `En la lectura guardada, el elemento no está completado y vence dentro de ${policy.dueSoonHours} horas.`);
    if (tracking.blocked === true && tracking.schedule !== 'completed_declared') finding('blocked', tracking.attention,
      'La lectura contiene una etiqueta de bloqueo mapeada explícitamente.', [{ field: 'labelNames', value: item.labelNames }]);
    if (tracking.qualityIssues.length) finding('data_quality', 'review', 'Faltan datos o existen contradicciones que requieren revisión.',
      [{ field: 'qualityIssues', value: tracking.qualityIssues }, { field: 'state', value: item.state }, { field: 'start', value: item.start }, { field: 'due', value: item.due },
        { field: 'dueComplete', value: item.dueComplete }, { field: 'memberIds', value: item.memberIds }]);
  }
  const activities = operational.filter(item => item.kind === 'activity');
  const milestones = operational.filter(item => item.kind === 'milestone');
  const byId = new Map(result.items.map(item => [item.itemId, item]));
  const count = (items: TrelloItem[], predicate: (item: ItemTracking) => boolean) => items.filter(item => predicate(byId.get(item.id)!)).length;
  const completed = activities.filter(item => item.state === 'completed').length;
  result.summary = {
    activities: { total: activities.length, pending: activities.filter(item => item.state === 'pending').length,
      inProgress: activities.filter(item => item.state === 'in_progress').length, completedDeclared: completed,
      unknown: activities.filter(item => item.state === 'unknown').length,
      overdue: count(activities, item => item.schedule === 'overdue'), dueSoon: count(activities, item => item.schedule === 'due_soon'),
      notEvaluable: count(activities, item => item.schedule === 'not_evaluable'), blocked: count(activities, item => item.blocked === true),
      blockingUnknown: count(activities, item => item.blocked === null) },
    milestones: { total: milestones.length, completedDeclared: milestones.filter(item => item.state === 'completed').length,
      overdue: count(milestones, item => item.schedule === 'overdue'), dueSoon: count(milestones, item => item.schedule === 'due_soon'), notEvaluable: count(milestones, item => item.schedule === 'not_evaluable') },
    progress: { numerator: completed, denominator: activities.length, percent: activities.length ? Math.round(completed / activities.length * 10000) / 100 : null, basis: 'declared_completion' },
    affectedItems: new Set(result.findings.map(finding => finding.itemId)).size,
  };
  result.findings.sort((a, b) => rank[b.attention] - rank[a.attention] || a.itemId.localeCompare(b.itemId) || a.code.localeCompare(b.code));
  return result;
}

function evaluateItem(item: TrelloItem, now: number, policy: TrackingPolicy, validSourceDate: boolean): ItemTracking {
  const issues = new Set(item.qualityIssues);
  const priorities = [...new Set(item.labelNames.flatMap(label => policy.priorityLabels[label] ? [policy.priorityLabels[label]!] : []))];
  if (priorities.length > 1) issues.add('conflicting_priority');
  const blocked = policy.blockedLabels.length ? item.labelNames.some(label => policy.blockedLabels.includes(label)) : null;
  const due = date(item.due);
  const start = date(item.start);
  if (item.state === 'unknown') issues.add('missing_or_conflicting_state');
  if (item.due && due === null) issues.add('invalid_due');
  if (item.start && start === null) issues.add('invalid_start');
  if (!item.due) issues.add('missing_due');
  if (item.kind === 'activity' && !item.start) issues.add('missing_start');
  if (!item.memberIds.length) issues.add('missing_assignee');
  if (due !== null && start !== null && start > due) issues.add('invalid_schedule');
  if (item.state !== 'unknown' && (item.state === 'completed') !== item.dueComplete) issues.add('completion_conflict');
  if (blocked && item.state === 'completed') issues.add('completed_with_block');
  const result: ItemTracking = { itemId: item.id, schedule: 'not_evaluable', attention: 'none', overdueHours: null,
    priority: priorities.length === 1 ? priorities[0]! : null, blocked, qualityIssues: [] };
  const completionReliable = item.state !== 'unknown' && !issues.has('completion_conflict');
  if (validSourceDate && completionReliable) {
    if (item.state === 'completed') result.schedule = 'completed_declared';
    else if (due !== null && !issues.has('invalid_schedule')) {
      if (due < now) { result.schedule = 'overdue'; result.overdueHours = (now - due) / hour; result.attention = 'immediate'; }
      else if (due <= now + policy.dueSoonHours * hour) { result.schedule = 'due_soon'; result.attention = blocked ? 'immediate' : 'upcoming'; }
      else result.schedule = 'scheduled';
    }
  }
  if (blocked && result.schedule !== 'completed_declared' && result.attention === 'none') result.attention = 'upcoming';
  if (issues.size && result.attention === 'none') result.attention = 'review';
  result.qualityIssues = [...issues].sort();
  return result;
}
