// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useFleetReadinessSummary } from './useFleetReadinessSummary';

vi.mock('../../lib/api', () => ({
  api: {
    rentalHealth: {
      getFleetSummary: vi.fn(),
    },
  },
}));

import { api } from '../../lib/api';

const canonicalSummary = {
  total: 47,
  ready: 42,
  notReady: 3,
  unevaluable: 1,
  unknown: 1,
  readyPercent: 89,
};

describe('useFleetReadinessSummary', () => {
  beforeEach(() => {
    vi.mocked(api.rentalHealth.getFleetSummary).mockReset();
    vi.mocked(api.rentalHealth.getFleetSummary).mockResolvedValue(canonicalSummary);
  });

  it('passes selected stationId to rentalHealth.getFleetSummary (req 10)', async () => {
    const { result, unmount } = renderHook(() =>
      useFleetReadinessSummary({
        orgId: 'org-1',
        stationId: 'st-42',
      }),
    );

    await waitForHook(() => result.current.loading === false);

    expect(api.rentalHealth.getFleetSummary).toHaveBeenCalledWith('org-1', {
      stationId: 'st-42',
    });
    expect(result.current.summary).toEqual(canonicalSummary);
    unmount();
  });

  it('refetches when stationId changes', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string | null }) =>
        useFleetReadinessSummary({
          orgId: 'org-1',
          stationId,
        }),
      { initialProps: { stationId: 'st-a' as string | null } },
    );

    await waitForHook(() => result.current.loading === false);
    expect(api.rentalHealth.getFleetSummary).toHaveBeenLastCalledWith('org-1', {
      stationId: 'st-a',
    });

    rerender({ stationId: 'st-b' });
    await waitForHook(() =>
      api.rentalHealth.getFleetSummary.mock.calls.some(
        (call) => call[1]?.stationId === 'st-b',
      ),
    );
    unmount();
  });

  it('clears summary on API error without fabricating healthy counts (req 11)', async () => {
    vi.mocked(api.rentalHealth.getFleetSummary).mockRejectedValueOnce(new Error('upstream failed'));

    const { result, unmount } = renderHook(() =>
      useFleetReadinessSummary({
        orgId: 'org-1',
        stationId: null,
      }),
    );

    await waitForHook(() => result.current.loading === false);

    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeTruthy();
    unmount();
  });
});
