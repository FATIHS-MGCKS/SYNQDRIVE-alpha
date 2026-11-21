// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../test/renderHook';
import { useOrganizationsOperational } from './useOrganizationsOperational';

const listOperational = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    organizations: {
      listOperational: (...args: unknown[]) => listOperational(...args),
    },
  },
}));

vi.mock('./org.utils', () => ({
  readOrgListStateFromUrl: () => ({}),
  writeOrgListStateToUrl: () => undefined,
}));

describe('useOrganizationsOperational refresh strict mode', () => {
  beforeEach(() => {
    listOperational.mockReset();
  });

  it('refresh() swallows errors for manual/UI refresh (no rejection)', async () => {
    listOperational
      .mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 1 } })
      .mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useOrganizationsOperational());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('network down');
  });

  it('refreshStrict() rejects so mutation callers can detect refresh failure', async () => {
    listOperational
      .mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 1 } })
      .mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useOrganizationsOperational());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.refreshStrict();
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('network down');
    expect(result.current.error).toBe('network down');
  });

  it('refreshStrict() resolves on success', async () => {
    listOperational.mockResolvedValue({
      data: [{ id: 'o1' }],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });
    const { result } = renderHook(() => useOrganizationsOperational());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.refreshStrict();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data?.data).toHaveLength(1);
  });
});