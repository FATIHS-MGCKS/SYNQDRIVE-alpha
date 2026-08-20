// @vitest-environment happy-dom
import { act } from 'react';
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

const summaryA = {
  total: 10,
  ready: 8,
  notReady: 1,
  unevaluable: 1,
  unknown: 0,
  readyPercent: 80,
};

const summaryB = {
  total: 5,
  ready: 4,
  notReady: 1,
  unevaluable: 0,
  unknown: 0,
  readyPercent: 80,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useFleetReadinessSummary request identity (P32-F02)', () => {
  beforeEach(() => {
    vi.mocked(api.rentalHealth.getFleetSummary).mockReset();
  });

  it('stale station-A success does not overwrite station-B summary', async () => {
    const stationA = deferred<typeof summaryA>();
    const stationB = deferred<typeof summaryB>();
    let call = 0;

    vi.mocked(api.rentalHealth.getFleetSummary).mockImplementation(() => {
      call += 1;
      return call === 1 ? stationA.promise : stationB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useFleetReadinessSummary({ orgId: 'org-1', stationId }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 1);
    rerender({ stationId: 'st-b' });
    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 2);

    stationB.resolve(summaryB);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.summary?.total).toBe(5);

    stationA.resolve(summaryA);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.summary?.total).toBe(5);
    unmount();
  });

  it('stale station-A error does not replace station-B success', async () => {
    const stationA = deferred<typeof summaryA>();
    const stationB = deferred<typeof summaryB>();
    let call = 0;

    vi.mocked(api.rentalHealth.getFleetSummary).mockImplementation(() => {
      call += 1;
      return call === 1 ? stationA.promise : stationB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ stationId }: { stationId: string }) =>
        useFleetReadinessSummary({ orgId: 'org-1', stationId }),
      { initialProps: { stationId: 'st-a' } },
    );

    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 1);
    rerender({ stationId: 'st-b' });
    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 2);

    stationB.resolve(summaryB);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.error).toBeNull();

    stationA.reject(new Error('station A failed'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.summary?.total).toBe(5);
    unmount();
  });

  it('refresh overlap keeps newest station summary', async () => {
    const first = deferred<typeof summaryA>();
    const second = deferred<typeof summaryB>();
    let call = 0;

    vi.mocked(api.rentalHealth.getFleetSummary).mockImplementation(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });

    const { result, unmount } = renderHook(() =>
      useFleetReadinessSummary({ orgId: 'org-1', stationId: 'st-a' }),
    );

    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 1);

    await act(async () => {
      void result.current.refresh();
    });
    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 2);

    second.resolve(summaryB);
    await waitForHook(() => result.current.summary?.total === 5);

    first.resolve(summaryA);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.summary?.total).toBe(5);
    unmount();
  });

  it('stale org-A success does not overwrite org-B summary', async () => {
    const orgA = deferred<typeof summaryA>();
    const orgB = deferred<typeof summaryB>();
    let call = 0;

    vi.mocked(api.rentalHealth.getFleetSummary).mockImplementation(() => {
      call += 1;
      return call === 1 ? orgA.promise : orgB.promise;
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }: { orgId: string }) => useFleetReadinessSummary({ orgId, stationId: 'st-1' }),
      { initialProps: { orgId: 'org-a' } },
    );

    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 1);
    rerender({ orgId: 'org-b' });
    await waitForHook(() => api.rentalHealth.getFleetSummary.mock.calls.length >= 2);

    orgB.resolve(summaryB);
    await waitForHook(() => result.current.loading === false);
    expect(result.current.summary?.total).toBe(5);

    orgA.resolve(summaryA);
    await waitForHook(() => result.current.summary?.total === 5);
    expect(result.current.summary?.total).toBe(5);
    unmount();
  });
});
