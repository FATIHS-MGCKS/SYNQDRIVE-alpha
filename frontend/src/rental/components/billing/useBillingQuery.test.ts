// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useBillingQuery } from './useBillingQuery';

describe('useBillingQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aborts stale requests when deps change quickly', async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    let resolveSecond: ((value: string) => void) | undefined;

    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { result, rerender, unmount } = renderHook(
      ({ deps }: { deps: number[] }) =>
        useBillingQuery({
          orgId: 'org-a',
          deps,
          fetcher,
        }),
      { initialProps: { deps: [1] } },
    );

    rerender({ deps: [2] });
    resolveSecond?.('fresh');
    await waitForHook(() => result.current.data === 'fresh');

    resolveFirst?.('stale');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.data).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('ignores abort errors from superseded requests', async () => {
    let rejectFirst: ((error: Error) => void) | undefined;

    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        (_signal: AbortSignal) =>
          new Promise<string>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce('ok');

    const { result, rerender, unmount } = renderHook(
      ({ deps }: { deps: number[] }) =>
        useBillingQuery({
          orgId: 'org-a',
          deps,
          fetcher,
        }),
      { initialProps: { deps: [1] } },
    );

    rerender({ deps: [2] });
    await waitForHook(() => result.current.data === 'ok');

    rejectFirst?.(new DOMException('Aborted', 'AbortError'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.data).toBe('ok');
    expect(result.current.error).toBeNull();

    unmount();
  });

  it('does not restart requests when fetcher identity changes between renders', async () => {
    const fetcher = vi.fn().mockResolvedValue('stable');

    const { result, rerender, unmount } = renderHook(
      ({ fetcherVersion }: { fetcherVersion: number }) =>
        useBillingQuery({
          orgId: 'org-a',
          deps: ['static'],
          fetcher: (_signal) => fetcher(fetcherVersion),
        }),
      { initialProps: { fetcherVersion: 1 } },
    );

    await waitForHook(() => result.current.data === 'stable');
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ fetcherVersion: 2 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('stable');
    expect(result.current.loading).toBe(false);

    unmount();
  });
});
