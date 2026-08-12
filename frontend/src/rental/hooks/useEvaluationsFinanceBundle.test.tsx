// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import type { RequestResult } from '../../lib/api';
import type { FinancialInsightsBundleDto } from '../lib/finance-insights.types';
import { useEvaluationsFinanceBundle } from './useEvaluationsFinanceBundle';

// Controllable status-aware transport mock. The hook (E6B.1) must map the HTTP
// status faithfully instead of collapsing every non-2xx into ERROR.
const financeResultMock =
  vi.fn<(orgId: string, stationIds?: string[]) => Promise<RequestResult<FinancialInsightsBundleDto>>>();

vi.mock('../../lib/api', () => ({
  api: {
    evaluations: {
      financeInsightsResult: (orgId: string, stationIds?: string[]) => financeResultMock(orgId, stationIds),
    },
  },
}));

const BUNDLE = { organizationId: 'org-a', period: {}, metrics: {} } as unknown as FinancialInsightsBundleDto;

beforeEach(() => financeResultMock.mockReset());
afterEach(() => vi.restoreAllMocks());

async function settledState(orgId: string | null, stationIds?: string[]) {
  const req = stationIds ? { stationIds } : undefined;
  const { result, unmount } = renderHook(() => useEvaluationsFinanceBundle(orgId, req));
  if (orgId) await waitForHook(() => result.current.phase === 'SETTLED');
  const snapshot = result.current;
  unmount();
  return snapshot;
}

describe('E6B.1 Finance transport status semantics (no HTTP status collapse)', () => {
  it('200 + valid body → AVAILABLE', async () => {
    financeResultMock.mockResolvedValue({ ok: true, status: 200, data: BUNDLE });
    const s = await settledState('org-a');
    expect(s.phase).toBe('SETTLED');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('AVAILABLE');
  });

  it('403 → UNAUTHORIZED (not ERROR)', async () => {
    financeResultMock.mockResolvedValue({ ok: false, status: 403, errorMessage: 'Forbidden' });
    const s = await settledState('org-a');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('UNAUTHORIZED');
  });

  it('404 → NOT_FOUND, and NEVER FEATURE_DISABLED (Finance is not feature-gated)', async () => {
    financeResultMock.mockResolvedValue({ ok: false, status: 404, errorMessage: 'Not found' });
    const s = await settledState('org-a');
    if (s.phase === 'SETTLED') {
      expect(s.result.state).toBe('NOT_FOUND');
      expect(s.result.state).not.toBe('FEATURE_DISABLED');
    }
  });

  it('500 → ERROR', async () => {
    financeResultMock.mockResolvedValue({ ok: false, status: 500, errorMessage: 'Server error' });
    const s = await settledState('org-a');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('ERROR');
  });

  it('network failure (status 0) → ERROR', async () => {
    financeResultMock.mockResolvedValue({ ok: false, status: 0, errorMessage: 'Network error' });
    const s = await settledState('org-a');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('ERROR');
  });
});

describe('E6B.1 Finance organization/station lifecycle (race safety preserved)', () => {
  it('null organization → IDLE, no request', async () => {
    const s = await settledState(null);
    expect(s.phase).toBe('IDLE');
    expect(financeResultMock).not.toHaveBeenCalled();
  });

  it('org A → org B settles with B (fresh fetch per scope)', async () => {
    financeResultMock.mockResolvedValue({ ok: true, status: 200, data: BUNDLE });
    const { result, rerender, unmount } = renderHook(
      (p: { orgId: string }) => useEvaluationsFinanceBundle(p.orgId),
      { initialProps: { orgId: 'org-a' } },
    );
    await waitForHook(() => result.current.phase === 'SETTLED');
    financeResultMock.mockResolvedValue({ ok: false, status: 403, errorMessage: 'Forbidden' });
    await rerender({ orgId: 'org-b' });
    await waitForHook(
      () => result.current.phase === 'SETTLED' && result.current.result.state === 'UNAUTHORIZED',
    );
    expect(financeResultMock).toHaveBeenLastCalledWith('org-b', undefined);
    unmount();
  });

  it('org A → null clears stale Finance data (back to IDLE)', async () => {
    financeResultMock.mockResolvedValue({ ok: true, status: 200, data: BUNDLE });
    const { result, rerender, unmount } = renderHook(
      (p: { orgId: string | null }) => useEvaluationsFinanceBundle(p.orgId),
      { initialProps: { orgId: 'org-a' as string | null } },
    );
    await waitForHook(() => result.current.phase === 'SETTLED');
    await rerender({ orgId: null });
    await waitForHook(() => result.current.phase === 'IDLE');
    expect(result.current.phase).toBe('IDLE');
    unmount();
  });

  it('station A → station B refetches for the new station scope', async () => {
    financeResultMock.mockResolvedValue({ ok: true, status: 200, data: BUNDLE });
    const { result, rerender, unmount } = renderHook(
      (p: { stationIds: string[] }) => useEvaluationsFinanceBundle('org-a', { stationIds: p.stationIds }),
      { initialProps: { stationIds: ['station-a'] } },
    );
    await waitForHook(() => result.current.phase === 'SETTLED');
    await rerender({ stationIds: ['station-b'] });
    await waitForHook(
      () => financeResultMock.mock.calls.at(-1)?.[1]?.[0] === 'station-b',
    );
    expect(financeResultMock).toHaveBeenLastCalledWith('org-a', ['station-b']);
    unmount();
  });
});
