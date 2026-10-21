import { describe, it, expect } from 'vitest';
import { recipients } from './recipients.js';
import { defaultSettings } from './settings.js';
import type { TrelloSnapshot } from '@dev-project-agent/contracts';
const snapshot = { members: [{ id: 'a', displayName: 'Member', username: 'member' }], items: [{ id: 'card', listId: 'phase', memberIds: ['a'], archived: false }] } as TrelloSnapshot;
describe('responsibility notification routing', () => {
    const settings = { ...defaultSettings, recipient: 'manager@example.com', contacts: [{ memberId: 'a', email: 'owner@example.com' }], phaseContacts: [{ listId: 'phase', email: 'phase@example.com' }] };
    it('preserves manager-only settings and deduplicates explicit owners', () => { expect(recipients(settings, snapshot, 'card')).toEqual(['manager@example.com']); expect(recipients({ ...settings, audience: 'both', contacts: [{ memberId: 'a', email: 'MANAGER@example.com' }] }, snapshot, 'card')).toEqual(['manager@example.com']); });
    it('uses a phase only when no valid member contact exists', () => { expect(recipients({ ...settings, audience: 'responsibles' }, snapshot, 'card')).toEqual(['owner@example.com']); expect(recipients({ ...settings, audience: 'responsibles', contacts: [] }, snapshot, 'card')).toEqual(['phase@example.com']); });
    it('overrides the general audience for the selected event only', () => { const specific = { ...settings, audience: 'both' as const, audienceByEvent: { report_ready: 'manager' as const, overdue: 'responsibles' as const } }; expect(recipients(specific, snapshot, 'card', 'overdue')).toEqual(['owner@example.com']); expect(recipients(specific, snapshot, null, 'report_ready')).toEqual(['manager@example.com']); expect(recipients(specific, snapshot, 'card', 'blocked')).toEqual(['manager@example.com', 'owner@example.com']); });
    it('does not guess missing addresses or use a departed member', () => { expect(recipients({ ...settings, audience: 'responsibles' }, null, 'card')).toEqual([]); expect(recipients({ ...settings, audience: 'responsibles', phaseContacts: [] }, { ...snapshot, members: [] }, 'card')).toEqual([]); expect(recipients({ ...settings, audience: 'responsibles', fallbackToManager: true }, null, null)).toEqual(['manager@example.com']); });
});
