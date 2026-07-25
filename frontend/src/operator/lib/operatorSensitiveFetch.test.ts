import { vi, describe, expect, it } from 'vitest';

vi.mock('../../lib/auth', () => ({
  getToken: () => 'test-token',
  clearAuth: vi.fn(),
}));

import { operatorSensitiveFetch } from './operatorSensitiveFetch';

describe('operatorSensitiveFetch', () => {
  it('uses no-store cache policy', async () => {
    const originalFetch = global.fetch;
    let capturedInit: RequestInit | undefined;
    global.fetch = (async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      await operatorSensitiveFetch('/test');
      expect(capturedInit?.cache).toBe('no-store');
      expect((capturedInit?.headers as Record<string, string>)?.['Cache-Control']).toBe('no-store');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
