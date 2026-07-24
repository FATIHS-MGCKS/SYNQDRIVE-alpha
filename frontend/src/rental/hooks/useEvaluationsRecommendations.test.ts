// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useEvaluationsRecommendations } from './useEvaluationsRecommendations';

const baseRow = {
  id: 'rec-1',
  organizationId: 'org-1',
  sourceType: 'DASHBOARD_INSIGHT' as const,
  sourceId: 'insight-1',
  category: 'MAINTENANCE' as const,
  title: 'Test',
  description: 'Desc',
  rationale: 'Because of telemetry trend.',
  expectedBenefit: null,
  estimatedCost: null,
  expectedNetBenefit: null,
  confidence: 'HIGH' as const,
  priority: 10,
  affectedEntities: [],
  ownerId: null,
  dueAt: null,
  status: 'NEW' as const,
  createdAt: '2026-07-24T10:00:00.000Z',
  updatedAt: '2026-07-24T10:00:00.000Z',
  calculationVersion: 'recommendation-v1',
};

const baseRow2 = {
  ...baseRow,
  id: 'rec-2',
  title: 'Second',
  status: 'NEW' as const,
};

vi.mock('../../lib/api', () => ({
  api: {
    evaluationsRecommendations: {
      list: vi.fn(async () => [baseRow, baseRow2]),
      transitionStatus: vi.fn(async (_org, id, body) => ({
        ...(id === 'rec-1' ? baseRow : baseRow2),
        status: body.status,
        updatedAt: new Date().toISOString(),
      })),
      getEvents: vi.fn(async () => []),
      update: vi.fn(async () => baseRow),
    },
  },
}));

describe('useEvaluationsRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads recommendations for org', async () => {
    const { result, unmount } = renderHook(() => useEvaluationsRecommendations('org-1'));
    await waitForHook(() => !result.current.loading);
    expect(result.current.items).toHaveLength(2);
    unmount();
  });

  it('rolls back optimistic status transition on failure', async () => {
    const { api } = await import('../../lib/api');
    vi.mocked(api.evaluationsRecommendations.transitionStatus).mockRejectedValueOnce(
      new Error('conflict'),
    );

    const { result, unmount } = renderHook(() => useEvaluationsRecommendations('org-1'));
    await waitForHook(() => !result.current.loading);

    await expect(result.current.transitionStatus('rec-1', 'REVIEWED')).rejects.toThrow(
      'conflict',
    );

    expect(result.current.items[0]?.status).toBe('NEW');
    unmount();
  });

  it('keeps successful transition when a later parallel transition fails', async () => {
    const { api } = await import('../../lib/api');
    vi.mocked(api.evaluationsRecommendations.transitionStatus).mockImplementation(
      async (_org, id, body) => {
        if (id === 'rec-2') {
          throw new Error('parallel conflict');
        }
        return {
          ...(id === 'rec-1' ? baseRow : baseRow2),
          status: body.status,
          updatedAt: new Date().toISOString(),
        };
      },
    );

    const { result, unmount } = renderHook(() => useEvaluationsRecommendations('org-1'));
    await waitForHook(() => !result.current.loading);

    await result.current.transitionStatus('rec-1', 'REVIEWED');
    await waitForHook(
      () => result.current.items.find((row) => row.id === 'rec-1')?.status === 'REVIEWED',
    );
    await expect(result.current.transitionStatus('rec-2', 'REVIEWED')).rejects.toThrow(
      'parallel conflict',
    );

    expect(result.current.items.find((row) => row.id === 'rec-1')?.status).toBe('REVIEWED');
    expect(result.current.items.find((row) => row.id === 'rec-2')?.status).toBe('NEW');
    unmount();
  });

  it('surfaces load errors', async () => {
    const { api } = await import('../../lib/api');
    vi.mocked(api.evaluationsRecommendations.list).mockRejectedValueOnce(
      new Error('network down'),
    );

    const { result, unmount } = renderHook(() => useEvaluationsRecommendations('org-1'));
    await waitForHook(() => !result.current.loading);

    expect(result.current.error).toBe('network down');
    expect(result.current.items).toEqual([]);
    unmount();
  });
});
