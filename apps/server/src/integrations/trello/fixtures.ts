// Synthetic fixtures contain no exported project data or credentials.
export const boardId = 'a'.repeat(24);
export const listId = 'b'.repeat(24);
export const memberId = 'c'.repeat(24);
export function boardFixture() {
  return {
    id: boardId, name: 'Synthetic project',
    lists: [{ id: listId, name: 'Phase', closed: false }],
    members: [{ id: memberId, fullName: 'Test member', username: 'test-member' }],
    cards: [{ id: 'd'.repeat(24), idBoard: boardId, idList: listId, name: 'Test activity', labels: [{ name: 'PENDIENTE' }], closed: false,
      start: '2026-10-01T13:00:00.000Z', due: '2026-10-10T22:00:00.000Z', dueComplete: false, idMembers: [memberId] }],
  };
}
