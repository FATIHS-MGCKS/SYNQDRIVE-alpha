// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitForHook } from '../../../test/renderHook';
import { useCommunicationDashboard } from './useCommunicationDashboard';

vi.mock('../../../lib/api', () => ({
  api: {
    communication: {
      getConversationSummary: vi.fn(),
      getAttentionPreview: vi.fn(),
    },
  },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

import { api } from '../../../lib/api';

describe('useCommunicationDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.communication.getConversationSummary).mockResolvedValue({
      totalUnreadMessages: 1,
      unreadConversations: 1,
      unassigned: 1,
      requiresAttention: 1,
      byChannel: {},
    });
    vi.mocked(api.communication.getAttentionPreview).mockResolvedValue({
      items: [
        {
          id: 'conv-a',
          channel: 'WHATSAPP',
          status: 'HUMAN_REQUIRED',
          unreadCount: 1,
          lastActivityAt: '2026-08-22T10:00:00.000Z',
          displayLabel: 'A',
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores stale org A responses after switching to org B', async () => {
    let resolveA!: (value: unknown) => void;
    const orgAPromise = new Promise((resolve) => {
      resolveA = resolve;
    });

    vi.mocked(api.communication.getConversationSummary).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return orgAPromise as never;
      return Promise.resolve({
        totalUnreadMessages: 0,
        unreadConversations: 0,
        unassigned: 0,
        requiresAttention: 0,
        byChannel: {},
      });
    });

    vi.mocked(api.communication.getAttentionPreview).mockImplementation((orgId: string) => {
      if (orgId === 'org-a') return orgAPromise as never;
      return Promise.resolve({ items: [] });
    });

    const { result, rerender, unmount } = renderHook(
      ({ orgId }) => useCommunicationDashboard({ orgId, enabled: true }),
      { initialProps: { orgId: 'org-a' } },
    );

    rerender({ orgId: 'org-b' });
    await waitForHook(() => result.current.loading === false);
    expect(result.current.summary?.unreadConversations).toBe(0);

    resolveA({
      totalUnreadMessages: 9,
      unreadConversations: 9,
      unassigned: 9,
      requiresAttention: 9,
      byChannel: {},
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.summary?.unreadConversations).toBe(0);

    unmount();
  });

  it('retains summary when attention preview request fails', async () => {
    vi.mocked(api.communication.getAttentionPreview).mockRejectedValue(new Error('preview failed'));

    const { result, unmount } = renderHook(() =>
      useCommunicationDashboard({ orgId: 'org-1', enabled: true }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(result.current.summary?.unreadConversations).toBe(1);
    expect(result.current.listError).toBeTruthy();
    expect(result.current.rows).toEqual([]);

    unmount();
  });

  it('skips attention preview when summary reports no attention', async () => {
    vi.mocked(api.communication.getConversationSummary).mockResolvedValue({
      totalUnreadMessages: 0,
      unreadConversations: 0,
      unassigned: 0,
      requiresAttention: 0,
      byChannel: {},
    });

    const { result, unmount } = renderHook(() =>
      useCommunicationDashboard({ orgId: 'org-1', enabled: true }),
    );

    await waitForHook(() => result.current.loading === false);
    expect(api.communication.getAttentionPreview).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);

    unmount();
  });

  it('reloads when refreshSignal changes', async () => {
    const { rerender, unmount } = renderHook(
      ({ refreshSignal }) =>
        useCommunicationDashboard({ orgId: 'org-1', enabled: true, refreshSignal }),
      { initialProps: { refreshSignal: null as string | null } },
    );

    await waitForHook(() => vi.mocked(api.communication.getConversationSummary).mock.calls.length === 1);
    rerender({ refreshSignal: '2026-08-22T12:00:00.000Z' });
    await waitForHook(() => vi.mocked(api.communication.getConversationSummary).mock.calls.length === 2);

    unmount();
  });
});
