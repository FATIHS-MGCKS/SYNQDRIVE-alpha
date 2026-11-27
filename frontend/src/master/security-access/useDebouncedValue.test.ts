// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitForHook } from '../../test/renderHook';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces value updates and clears timer on unmount', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    expect(result.current).toBe('a');
    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await waitForHook(() => result.current === 'ab');
    expect(result.current).toBe('ab');

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
  });
});