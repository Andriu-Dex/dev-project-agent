import { describe, it, expect } from 'vitest';
import { compareSnapshots, normalizeBoard } from './normalize.js';
import { boardFixture, boardId, listId } from './fixtures.js';

describe('Trello observations', () => {
  it('rejects dates without a time or explicit timezone before normalizing them', () => {
    for (const due of ['2026-10-10', '2026-10-10T12:00:00']) {
      const board = boardFixture();
      board.cards[0]!.due = due;
      expect(() => normalizeBoard(board, boardId, [listId])).toThrow();
    }
  });
  it('separates milestones, references, and archived items', () => {
    const board = boardFixture();
    board.cards[0]!.labels = [{ name: 'HITO' }, { name: 'PENDIENTE' }];
    expect(normalizeBoard(board, boardId, [listId]).items[0]!.kind).toBe('milestone');
    expect(normalizeBoard(board, boardId, []).items[0]!.kind).toBe('reference');
    board.lists[0]!.closed = true;
    expect(normalizeBoard(board, boardId, [listId]).items[0]!.archived).toBe(true);
  });
  it('flags conflicting declarations without inferring completion', () => {
    const board = boardFixture();
    board.cards[0]!.labels = [{ name: 'COMPLETADA' }];
    expect(normalizeBoard(board, boardId, [listId]).items[0]!.qualityIssues).toContain('completion_conflict');
    board.cards[0]!.labels.push({ name: 'PENDIENTE' });
    expect(normalizeBoard(board, boardId, [listId]).items[0]!.state).toBe('unknown');
  });
  it('rejects other boards, duplicates, missing lists, and invalid dates', () => {
    const board = boardFixture();
    expect(() => normalizeBoard(board, 'e'.repeat(24), [listId])).toThrow();
    board.cards.push({ ...board.cards[0]! });
    expect(() => normalizeBoard(board, boardId, [listId])).toThrow();
    board.cards.pop();
    board.cards[0]!.due = 'invalid';
    expect(() => normalizeBoard(board, boardId, [listId])).toThrow();
    board.cards[0]!.due = '2026-10-10';
    board.lists = [];
    expect(() => normalizeBoard(board, boardId, [listId])).toThrow();
  });
  it('compares fields, treats ordering as irrelevant, and does not equate absence to deletion', () => {
    const board = boardFixture();
    const first = normalizeBoard(board, boardId, [listId]);
    expect(compareSnapshots(null, first)).toEqual([]);
    expect(compareSnapshots(first, first)).toEqual([]);
    board.cards[0]!.due = '2026-10-11T22:00:00Z';
    const next = normalizeBoard(board, boardId, [listId]);
    expect(compareSnapshots(first, next).map(change => change.field)).toEqual(['due']);
    expect(compareSnapshots(first, { ...next, items: [] })[0]!.field).toBe('not_observed');
  });
});
