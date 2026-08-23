// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test/renderHook';
import {
  communicationClient,
  CommunicationClientError,
} from '../communication-client';
import { useCommunicationConversationActions } from './useCommunicationConversationActions';
import type { CommunicationConversationDetail } from '../types';

vi.mock('../communication-client', () => ({
  communicationClient: {
    claimConversation: vi.fn(),
    assignConversation: vi.fn(),
    resolveConversation: vi.fn(),
    reopenConversation: vi.fn(),
    markConversationRead: vi.fn(),
  },
  CommunicationClientError: class CommunicationClientError extends Error {
    code: 'unknown' | 'already_claimed' | 'stale_state';
    status?: number;
    constructor(
      message: string,
      code: 'unknown' | 'already_claimed' | 'stale_state' = 'unknown',
      status?: number,
    ) {
      super(message);
      this.name = 'CommunicationClientError';
      this.code = code;
      this.status = status;
    }
  },
}));

const humanActiveConversation: CommunicationConversationDetail = {
  id: 'conv-1',
  channel: 'WHATSAPP',
  status: 'HUMAN_ACTIVE',
  unreadCount: 0,
  lastActivityAt: '2026-08-22T10:00:00.000Z',
  displayLabel: 'Test',
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-22T10:00:00.000Z',
  assignedUser: { id: 'user-a', displayName: 'Operator A' },
};

describe('useCommunicationConversationActions takeover', () => {
  afterEach(() => {
    vi.mocked(communicationClient.claimConversation).mockReset();
  });

  it('takeOverSelf uses claim endpoint for canonical human takeover', async () => {
    vi.mocked(communicationClient.claimConversation).mockResolvedValue({
      conversation: humanActiveConversation,
    });

    const onConversationUpdated = vi.fn();
    const onTimelineRefresh = vi.fn();
    const onInboxRefresh = vi.fn();

    const { result, unmount } = renderHook(() =>
      useCommunicationConversationActions({
        orgId: 'org-1',
        conversationId: 'conv-1',
        onConversationUpdated,
        onTimelineRefresh,
        onInboxRefresh,
      }),
    );

    await act(async () => {
      await result.current.takeOverSelf();
    });

    expect(communicationClient.claimConversation).toHaveBeenCalledWith('org-1', 'conv-1');
    expect(communicationClient.assignConversation).not.toHaveBeenCalled();
    expect(onConversationUpdated).toHaveBeenCalledWith(humanActiveConversation);
    expect(onTimelineRefresh).toHaveBeenCalled();
    expect(onInboxRefresh).toHaveBeenCalled();
    unmount();
  });

  it('surfaces already_claimed on takeover conflict and refreshes detail', async () => {
    vi.mocked(communicationClient.claimConversation).mockRejectedValue(
      new CommunicationClientError('ALREADY_CLAIMED', 'already_claimed', 409),
    );

    const onConflictRefresh = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCommunicationConversationActions({
        orgId: 'org-1',
        conversationId: 'conv-1',
        onConflictRefresh,
      }),
    );

    await act(async () => {
      await result.current.takeOverSelf();
    });

    expect(result.current.actionError).toBe('already_claimed');
    expect(onConflictRefresh).toHaveBeenCalled();
    unmount();
  });
});
