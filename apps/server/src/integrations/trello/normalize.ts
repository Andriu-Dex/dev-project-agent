import type { TrelloSnapshot, TrelloItem, TrelloChange } from '@dev-project-agent/contracts';
import { isDeepStrictEqual } from 'node:util';
import { parsePlanning, resolveDependencies } from './planning.js';

export class TrelloError extends Error {
  constructor(readonly code: string) { super('Trello source could not be read.'); }
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TrelloError('INVALID_SOURCE');
  return value as ObjectValue;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.length > 20_000) throw new TrelloError('INVALID_SOURCE');
  return value;
}
function id(value: unknown): string {
  const result = string(value);
  if (!/^[a-f0-9]{24}$/.test(result)) throw new TrelloError('INVALID_SOURCE');
  return result;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 5000) throw new TrelloError('INVALID_SOURCE');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TrelloError('INVALID_SOURCE');
  return value;
}
function date(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = string(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw new TrelloError('INVALID_SOURCE');
  if (!Number.isFinite(Date.parse(text))) throw new TrelloError('INVALID_SOURCE');
  return new Date(text).toISOString();
}
function unique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map(value => value.id)).size !== values.length) throw new TrelloError('INVALID_SOURCE');
  return values.sort((a, b) => a.id.localeCompare(b.id));
}

export function normalizeBoard(value: unknown, boardId: string, operationalLists: string[]): TrelloSnapshot {
  const board = object(value);
  if (id(board.id) !== boardId) throw new TrelloError('BOARD_MISMATCH');
  const lists = unique(array(board.lists).map(value => {
    const list = object(value);
    return { id: id(list.id), name: string(list.name), closed: boolean(list.closed) };
  }));
  const members = unique(array(board.members).map(value => {
    const member = object(value);
    return { id: id(member.id), displayName: string(member.fullName), username: string(member.username) };
  }));
  const items = unique(array(board.cards).map(value => {
    const card = object(value);
    if (card.idBoard !== boardId) throw new TrelloError('BOARD_MISMATCH');
    const listId = id(card.idList);
    if (!lists.some(list => list.id === listId)) throw new TrelloError('INCOMPLETE_SOURCE');
    const labelNames = array(card.labels).map(value => string(object(value).name)).sort();
    const states = labelNames.filter(label => ['PENDIENTE', 'EN CURSO', 'COMPLETADA'].includes(label));
    const state: TrelloItem['state'] = states.length !== 1 ? 'unknown' : ({ PENDIENTE: 'pending', 'EN CURSO': 'in_progress', COMPLETADA: 'completed' } as const)[states[0] as 'PENDIENTE' | 'EN CURSO' | 'COMPLETADA'];
    const kind: TrelloItem['kind'] = !operationalLists.includes(listId) ? 'reference' : labelNames.includes('HITO') ? 'milestone' : 'activity';
    const start = date(card.start);
    const due = date(card.due);
    const archived = boolean(card.closed) || lists.find(list => list.id === listId)!.closed;
    const dueComplete = boolean(card.dueComplete);
    const memberIds = array(card.idMembers).map(id).sort();
    const qualityIssues: string[] = [];
    if (kind !== 'reference' && !archived) {
      if (state === 'unknown') qualityIssues.push(states.length > 1 ? 'conflicting_state' : 'missing_state');
      if (!due) qualityIssues.push('missing_due');
      if (kind === 'activity' && !start) qualityIssues.push('missing_start');
      if (!memberIds.length) qualityIssues.push('missing_assignee');
      if (memberIds.some(member => !members.some(row => row.id === member))) qualityIssues.push('unresolved_assignee');
      if (state !== 'unknown' && (state === 'completed') !== dueComplete) qualityIssues.push('completion_conflict');
      if (start && due && start > due) qualityIssues.push('invalid_schedule');
    }
    const planning = parsePlanning(card.desc === undefined ? '' : string(card.desc));
    const declaredChecklists = card.idChecklists === undefined ? [] : array(card.idChecklists).map(id);
    const allChecklists = board.checklists === undefined ? [] : array(board.checklists).map(object);
    if (declaredChecklists.some(checklistId => !allChecklists.some(row => row.id === checklistId && row.idCard === card.id))) throw new TrelloError('INCOMPLETE_SOURCE');
    planning.checklists = unique(allChecklists.filter(row => row.idCard === card.id).map(row => ({ id: id(row.id), name: string(row.name),
      items: unique(array(row.checkItems).map(value => { const entry = object(value); if (!['complete', 'incomplete'].includes(string(entry.state))) throw new TrelloError('INVALID_SOURCE');
        return { id: id(entry.id), name: string(entry.name), completedDeclared: entry.state === 'complete' }; })) })));
    return { id: id(card.id), name: string(card.name), listId, kind, state, labelNames, start, due, dueComplete, archived, memberIds, qualityIssues, planning };
  }));
  resolveDependencies(items);
  return { board: { id: boardId, name: string(board.name) }, lists, members, items };
}

export function compareSnapshots(previous: TrelloSnapshot | null, next: TrelloSnapshot): TrelloChange[] {
  if (!previous) return [];
  const changes: TrelloChange[] = [];
  const old = new Map(previous.items.map(item => [item.id, item]));
  for (const item of next.items) {
    const before = old.get(item.id);
    if (!before) changes.push({ itemId: item.id, itemName: item.name, field: 'added', before: null, after: item });
    else for (const field of ['name', 'listId', 'kind', 'state', 'labelNames', 'start', 'due', 'dueComplete', 'archived', 'memberIds', 'planning'] as const) {
      if (!isDeepStrictEqual(before[field], item[field])) changes.push({ itemId: item.id, itemName: item.name, field, before: before[field] ?? null, after: item[field] ?? null });
    }
    old.delete(item.id);
  }
  for (const item of old.values()) changes.push({ itemId: item.id, itemName: item.name, field: 'not_observed', before: item, after: null });
  return changes;
}
