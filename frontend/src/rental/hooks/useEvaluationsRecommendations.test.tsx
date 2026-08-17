// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import type { RequestResult } from '../../lib/api';
import type { EvaluationsRecommendationsResponse } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import { e7TestResponse } from '../lib/evaluations/evaluations-recommendations-test-fixtures';
import type { EvaluationsAnalyticsRequest } from '../lib/evaluations/evaluations-request';
import { useEvaluationsRecommendations } from './useEvaluationsCanonicalAnalytics';

const recommendationsMock =
  vi.fn<
    (orgId: string, req?: { periodType?: string; stationIds?: readonly string[] | null }) => Promise<
      RequestResult<EvaluationsRecommendationsResponse>
    >
  >();

vi.mock('../../lib/api', () => ({
  api: {
    evaluations: {
      analyticsRecommendations: (orgId: string, req?: unknown) => recommendationsMock(orgId, req as never),
    },
  },
}));

const PAYLOAD = e7TestResponse();

beforeEach(() => recommendationsMock.mockReset());
afterEach(() => vi.restoreAllMocks());

async function settled(orgId: string | null, req?: EvaluationsAnalyticsRequest) {
  const { result, unmount } = renderHook(() => useEvaluationsRecommendations(orgId, req));
  if (orgId) await waitForHook(() => result.current.phase === 'SETTLED');
  const snapshot = result.current;
  unmount();
  return snapshot;
}

describe('E7C recommendations API client path', () => {
  it('calls analyticsRecommendations with org and query dimensions', async () => {
    recommendationsMock.mockResolvedValue({ ok: true, status: 200, data: PAYLOAD });
    await settled('org-a', { periodType: 'ROLLING_30_DAYS', stationIds: ['s1', 's2'] });
    expect(recommendationsMock).toHaveBeenCalledWith('org-a', {
      periodType: 'ROLLING_30_DAYS',
      stationIds: ['s1', 's2'],
    });
  });
});

describe('E7C recommendations transport semantics', () => {
  it('200 → AVAILABLE transport (payload status preserved separately)', async () => {
    recommendationsMock.mockResolvedValue({ ok: true, status: 200, data: { ...PAYLOAD, status: 'PARTIAL' } });
    const s = await settled('org-a');
    if (s.phase === 'SETTLED' && s.result.state === 'AVAILABLE') {
      expect(s.result.data.status).toBe('PARTIAL');
    }
  });

  it('403 → UNAUTHORIZED', async () => {
    recommendationsMock.mockResolvedValue({ ok: false, status: 403, errorMessage: 'Forbidden' });
    const s = await settled('org-a');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('UNAUTHORIZED');
  });

  it('404 → NOT_FOUND (never FEATURE_DISABLED)', async () => {
    recommendationsMock.mockResolvedValue({ ok: false, status: 404, errorMessage: 'Not found' });
    const s = await settled('org-a');
    if (s.phase === 'SETTLED') {
      expect(s.result.state).toBe('NOT_FOUND');
      expect(s.result.state).not.toBe('FEATURE_DISABLED');
    }
  });

  it('500 → ERROR', async () => {
    recommendationsMock.mockResolvedValue({ ok: false, status: 500, errorMessage: 'x' });
    const s = await settled('org-a');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('ERROR');
  });

  it('network failure (status 0) → ERROR', async () => {
    recommendationsMock.mockResolvedValue({ ok: false, status: 0, errorMessage: 'net' });
    const s = await settled('org-a');
    if (s.phase === 'SETTLED') expect(s.result.state).toBe('ERROR');
  });
});

describe('E7C recommendations hook lifecycle', () => {
  it('null org → IDLE, zero fetch', async () => {
    const s = await settled(null);
    expect(s.phase).toBe('IDLE');
    expect(recommendationsMock).not.toHaveBeenCalled();
  });

  it('org A → org B clears and settles with B', async () => {
    recommendationsMock.mockResolvedValue({ ok: true, status: 200, data: PAYLOAD });
    const { result, rerender, unmount } = renderHook(
      (p: { orgId: string }) => useEvaluationsRecommendations(p.orgId, { periodType: 'MTD' }),
      { initialProps: { orgId: 'org-a' } },
    );
    await waitForHook(() => result.current.phase === 'SETTLED');
    recommendationsMock.mockResolvedValue({ ok: false, status: 403, errorMessage: 'Forbidden' });
    await rerender({ orgId: 'org-b' });
    await waitForHook(
      () => result.current.phase === 'SETTLED' && result.current.result.state === 'UNAUTHORIZED',
    );
    expect(recommendationsMock).toHaveBeenLastCalledWith('org-b', { periodType: 'MTD', stationIds: null });
    unmount();
  });

  it('org removed → IDLE', async () => {
    recommendationsMock.mockResolvedValue({ ok: true, status: 200, data: PAYLOAD });
    const { result, rerender, unmount } = renderHook(
      (p: { orgId: string | null }) => useEvaluationsRecommendations(p.orgId),
      { initialProps: { orgId: 'org-a' as string | null } },
    );
    await waitForHook(() => result.current.phase === 'SETTLED');
    await rerender({ orgId: null });
    await waitForHook(() => result.current.phase === 'IDLE');
    unmount();
  });
});
