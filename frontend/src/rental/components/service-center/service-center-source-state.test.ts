import { describe, expect, it } from 'vitest';
import {
  hasPartialServiceCenterData,
  isSourceUsable,
  normalizeArrayResponse,
  resolveSourceAfterError,
  resolveSourceAfterSuccess,
  TASKS_ERROR_MESSAGE,
} from './service-center-source-state';

describe('service-center-source-state', () => {
  it('marks successful responses as ready', () => {
    const result = resolveSourceAfterSuccess(['task-1'], '2026-07-20T12:00:00.000Z');

    expect(result.data).toEqual(['task-1']);
    expect(result.status).toBe('ready');
    expect(result.error).toBeNull();
  });

  it('treats successful empty arrays as zero items, not unknown', () => {
    const result = resolveSourceAfterSuccess([], '2026-07-20T12:00:00.000Z');

    expect(result.data).toEqual([]);
    expect(result.status).toBe('ready');
    expect(result.error).toBeNull();
  });

  it('returns error state without prior data', () => {
    const result = resolveSourceAfterError({
      previousData: [],
      previousStatus: 'idle',
      previousFetchedAt: null,
      emptyData: [],
      hasMeaningfulData: (items) => items.length > 0,
      errorMessage: TASKS_ERROR_MESSAGE,
    });

    expect(result.data).toEqual([]);
    expect(result.status).toBe('error');
    expect(result.error).toBe(TASKS_ERROR_MESSAGE);
  });

  it('keeps prior data as stale after reload failure', () => {
    const previous = [{ id: 'task-1' }];
    const result = resolveSourceAfterError({
      previousData: previous,
      previousStatus: 'ready',
      previousFetchedAt: '2026-07-20T11:00:00.000Z',
      emptyData: [],
      hasMeaningfulData: (items) => items.length > 0,
      errorMessage: TASKS_ERROR_MESSAGE,
    });

    expect(result.data).toEqual(previous);
    expect(result.status).toBe('stale');
    expect(result.fetchedAt).toBe('2026-07-20T11:00:00.000Z');
  });

  it('detects partial data when some sources succeed and others fail', () => {
    expect(
      hasPartialServiceCenterData(['ready', 'error', 'ready', 'loading']),
    ).toBe(true);
    expect(hasPartialServiceCenterData(['ready', 'ready', 'ready', 'ready'])).toBe(false);
    expect(hasPartialServiceCenterData(['error', 'error', 'error', 'error'])).toBe(false);
  });

  it('treats stale sources as usable', () => {
    expect(isSourceUsable('stale')).toBe(true);
    expect(isSourceUsable('error')).toBe(false);
  });

  it('normalizes non-array payloads to empty arrays', () => {
    expect(normalizeArrayResponse(null)).toEqual([]);
    expect(normalizeArrayResponse({ data: [] })).toEqual([]);
  });
});
