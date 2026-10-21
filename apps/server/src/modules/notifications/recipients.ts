import type { TrelloSnapshot } from '@dev-project-agent/contracts';
import type { NotificationSettings } from './settings.js';
export function recipients(settings: NotificationSettings, snapshot: TrelloSnapshot | null, itemId: string | null, kind?: string) {
    const audience = settings.audienceByEvent?.[kind as keyof NonNullable<NotificationSettings['audienceByEvent']>] ?? settings.audience ?? 'manager', found = new Set<string>();
    if (audience !== 'responsibles' && settings.recipient)
        found.add(settings.recipient.toLowerCase());
    const item = snapshot?.items.find(value => value.id === itemId && !value.archived);
    if (audience !== 'manager' && item) {
        const owners = (settings.contacts ?? []).filter(contact => item.memberIds.includes(contact.memberId) && snapshot!.members.some(member => member.id === contact.memberId));
        const emails = owners.length ? owners.map(contact => contact.email) : (settings.phaseContacts ?? []).filter(contact => contact.listId === item.listId).map(contact => contact.email);
        for (const email of emails)
            found.add(email.toLowerCase());
    }
    if (audience !== 'manager' && !found.size && settings.fallbackToManager && settings.recipient)
        found.add(settings.recipient.toLowerCase());
    return [...found];
}
