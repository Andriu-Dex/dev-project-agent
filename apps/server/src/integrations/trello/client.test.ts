import { describe, expect, it, vi } from 'vitest';
import { credentialsFromEnvironment, readBoard } from './client.js';
import { boardFixture, boardId } from './fixtures.js';

const credentials = { key: 'k'.repeat(32), token: 't'.repeat(64) };
describe('Read-only Trello adapter', () => {
  it('uses only fixed-host GET requests and never puts secrets in URLs', async () => {
    const board = boardFixture();
    const responses = [board, board.lists, board.members, board.cards, []];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(responses.shift()));
    expect(await readBoard(boardId, credentials, fetcher)).toMatchObject(board);
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(String(url)).host).toBe('api.trello.com');
      expect(String(url)).not.toContain(credentials.token);
      expect(String(url)).not.toContain(credentials.key);
      expect(options?.method).toBe('GET');
      expect(options?.redirect).toBe('error');
    }
  });
  it('sanitizes upstream failures and does not retry rate limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private response', { status: 429 }));
    await expect(readBoard(boardId, credentials, fetcher)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockRejectedValue(new Error('secret-bearing network diagnostics'));
    await expect(readBoard(boardId, credentials, fetcher)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE', message: 'Trello source could not be read.' });
  });
  it('requires local credentials and validates board identifiers before fetching', async () => {
    expect(credentialsFromEnvironment({})).toBeNull();
    expect(() => credentialsFromEnvironment({ TRELLO_API_KEY: 'bad"key', TRELLO_TOKEN: credentials.token })).toThrow();
    const fetcher = vi.fn<typeof fetch>();
    await expect(readBoard('../other', credentials, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects oversized or potentially truncated responses', async () => {
    const board = boardFixture();
    const responses = [board, board.lists, board.members, Array(1000).fill(board.cards[0])];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(responses.shift()));
    await expect(readBoard(boardId, credentials, fetcher)).rejects.toMatchObject({ code: 'SOURCE_TOO_LARGE' });
    fetcher.mockResolvedValue(new Response('x'.repeat(5_000_001)));
    await expect(readBoard(boardId, credentials, fetcher)).rejects.toMatchObject({ code: 'SOURCE_TOO_LARGE' });
  });
});
