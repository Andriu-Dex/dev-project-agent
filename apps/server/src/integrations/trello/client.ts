import { TrelloError } from './normalize.js';

export interface TrelloCredentials { key: string; token: string }
export function credentialsFromEnvironment(environment: NodeJS.ProcessEnv): TrelloCredentials | null {
  const key = environment.TRELLO_API_KEY;
  const token = environment.TRELLO_TOKEN;
  if (!key || !token) return null;
  if (!/^[a-zA-Z0-9]{16,256}$/.test(key) || !/^[a-zA-Z0-9_-]{16,256}$/.test(token)) throw new TrelloError('INVALID_CREDENTIAL_CONFIG');
  return { key, token };
}

export async function readBoard(boardId: string, credentials: TrelloCredentials, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!/^[a-f0-9]{24}$/.test(boardId)) throw new TrelloError('INVALID_BOARD');
  const signal = AbortSignal.timeout(25_000);
  async function get(path: string, parameters: Record<string, string>) {
    const url = new URL(`https://api.trello.com/1/boards/${boardId}${path}`);
    url.search = new URLSearchParams(parameters).toString();
    try {
      const response = await fetcher(url, {
        method: 'GET', redirect: 'error', signal,
        headers: { Accept: 'application/json', Authorization: `OAuth oauth_consumer_key="${credentials.key}", oauth_token="${credentials.token}"` },
      });
      if (!response.ok) throw new TrelloError(response.status === 429 ? 'RATE_LIMITED' : [401, 403].includes(response.status) ? 'ACCESS_DENIED' : 'SOURCE_UNAVAILABLE');
      if (!response.body) throw new TrelloError('INVALID_SOURCE');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 5_000_000) { await reader.cancel(); throw new TrelloError('SOURCE_TOO_LARGE'); }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) {
      if (error instanceof TrelloError) throw error;
      throw new TrelloError('SOURCE_UNAVAILABLE');
    }
  }
  const board = await get('', { fields: 'id,name' }) as Record<string, unknown>;
  const lists = await get('/lists', { filter: 'all', fields: 'id,name,closed' });
  const members = await get('/members', { fields: 'id,fullName,username' });
  const cards = await get('/cards', { filter: 'all', limit: '1000', fields: 'id,idBoard,idList,name,desc,closed,start,due,dueComplete,idMembers,labels,idChecklists' });
  // Reject the boundary rather than presenting a potentially truncated board as complete.
  if (!Array.isArray(cards) || cards.length >= 1000) throw new TrelloError('SOURCE_TOO_LARGE');
  const checklists = await get('/checklists', { fields: 'id,idCard,name,checkItems' });
  if (!Array.isArray(checklists) || checklists.length >= 1000) throw new TrelloError('SOURCE_TOO_LARGE');
  return { ...board, lists, members, cards, checklists };
}
