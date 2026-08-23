// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test/renderHook';
import { communicationClient } from '../communication-client';
import { useCommunicationReply } from './useCommunicationReply';

vi.mock('../communication-client', () => ({
  communicationClient: {
    replyConversation: vi.fn(),
  },
  CommunicationClientError: class CommunicationClientError extends Error {
    code = 'unknown' as const;
    constructor(message: string, code: 'unknown' | 'already_claimed' | 'invalid_query' = 'unknown') {
      super(message);
      this.name = 'CommunicationClientError';
      this.code = code;
    }
  },
}));

describe('useCommunicationReply', () => {
  beforeEach(() => {
    vi.mocked(communicationClient.replyConversation).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('isolates drafts per conversation', () => {
    const { result, rerender, unmount } = renderHook(
      ({ conversationId }) =>
        useCommunicationReply({
          orgId: 'org-1',
          conversationId,
        }),
      { initialProps: { conversationId: 'conv-a' } },
    );

    act(() => {
      result.current.setDraft('Draft A');
    });
    expect(result.current.draft).toBe('Draft A');

    rerender({ conversationId: 'conv-b' });
    expect(result.current.draft).toBe('');

    act(() => {
      result.current.setDraft('Draft B');
    });

    rerender({ conversationId: 'conv-a' });
    expect(result.current.draft).toBe('Draft A');
    unmount();
  });

  it('clears drafts on organization switch', () => {
    const { result, rerender, unmount } = renderHook(
      ({ orgId }) =>
        useCommunicationReply({
          orgId,
          conversationId: 'conv-1',
        }),
      { initialProps: { orgId: 'org-a' } },
    );

    act(() => {
      result.current.setDraft('Org A draft');
    });

    rerender({ orgId: 'org-b' });
    expect(result.current.draft).toBe('');
    unmount();
  });

  it('reuses idempotency key for retry after ambiguous failure', async () => {
    vi.mocked(communicationClient.replyConversation)
      .mockRejectedValueOnce(
        Object.assign(new Error('Delivery status is being confirmed'), {
          name: 'CommunicationClientError',
        }),
      )
      .mockResolvedValueOnce({
        sendState: 'ACCEPTED',
        conversation: {
          id: 'conv-1',
          channel: 'WHATSAPP',
          status: 'WAITING_CUSTOMER',
          unreadCount: 0,
          lastActivityAt: '2026-08-22T12:00:00.000Z',
          displayLabel: 'Test',
          customer: null,
          booking: null,
          vehicle: null,
          station: null,
          assignedUser: null,
          assignedAgent: null,
          createdAt: '2026-08-20T08:00:00.000Z',
          updatedAt: '2026-08-22T12:00:00.000Z',
        },
        event: null,
        commandId: 'cmd-1',
      });

    const { result, unmount } = renderHook(() =>
      useCommunicationReply({
        orgId: 'org-1',
        conversationId: 'conv-1',
      }),
    );

    act(() => {
      result.current.setDraft('Retry me');
    });

    await act(async () => {
      await result.current.send();
    });
    await act(async () => {
      await result.current.send();
    });

    expect(communicationClient.replyConversation).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(communicationClient.replyConversation).mock.calls[0]?.[2]
      ?.idempotencyKey;
    const secondKey = vi.mocked(communicationClient.replyConversation).mock.calls[1]?.[2]
      ?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    unmount();
  });

  it('resets idempotency key after definitive failure for new send attempt', async () => {
    vi.mocked(communicationClient.replyConversation)
      .mockRejectedValueOnce(new Error('SEND_FAILED'))
      .mockResolvedValueOnce({
        sendState: 'ACCEPTED',
        conversation: {
          id: 'conv-1',
          channel: 'WHATSAPP',
          status: 'WAITING_CUSTOMER',
          unreadCount: 0,
          lastActivityAt: '2026-08-22T12:00:00.000Z',
          displayLabel: 'Test',
          customer: null,
          booking: null,
          vehicle: null,
          station: null,
          assignedUser: null,
          assignedAgent: null,
          createdAt: '2026-08-20T08:00:00.000Z',
          updatedAt: '2026-08-22T12:00:00.000Z',
        },
        event: null,
        commandId: 'cmd-2',
      });

    const { result, unmount } = renderHook(() =>
      useCommunicationReply({
        orgId: 'org-1',
        conversationId: 'conv-1',
      }),
    );

    act(() => {
      result.current.setDraft('Retry me');
    });

    await act(async () => {
      await result.current.send();
    });
    await act(async () => {
      await result.current.send();
    });

    const firstKey = vi.mocked(communicationClient.replyConversation).mock.calls[0]?.[2]
      ?.idempotencyKey;
    const secondKey = vi.mocked(communicationClient.replyConversation).mock.calls[1]?.[2]
      ?.idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);
    unmount();
  });

  it('treats non-ACCEPTED response as failure without convergence refresh', async () => {
    const onConversationUpdated = vi.fn();
    const onTimelineRefresh = vi.fn();
    const onInboxRefresh = vi.fn();

    vi.mocked(communicationClient.replyConversation).mockResolvedValueOnce({
      sendState: 'FAILED',
      conversation: {
        id: 'conv-1',
        channel: 'WHATSAPP',
        status: 'HUMAN_ACTIVE',
        unreadCount: 0,
        lastActivityAt: '2026-08-22T12:00:00.000Z',
        displayLabel: 'Test',
        customer: null,
        booking: null,
        vehicle: null,
        station: null,
        assignedUser: null,
        assignedAgent: null,
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-08-22T12:00:00.000Z',
      },
      event: null,
      commandId: 'cmd-failed',
    });

    const { result, unmount } = renderHook(() =>
      useCommunicationReply({
        orgId: 'org-1',
        conversationId: 'conv-1',
        onConversationUpdated,
        onTimelineRefresh,
        onInboxRefresh,
      }),
    );

    act(() => {
      result.current.setDraft('Hello');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(onConversationUpdated).not.toHaveBeenCalled();
    expect(onTimelineRefresh).not.toHaveBeenCalled();
    expect(onInboxRefresh).not.toHaveBeenCalled();
    expect(result.current.sendErrorMessage).toBe('Could not send message');
    expect(result.current.draft).toBe('Hello');
    unmount();
  });

  it('ignores stale response after conversation switch', async () => {
    let resolveReply: ((value: unknown) => void) | undefined;
    vi.mocked(communicationClient.replyConversation).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReply = resolve;
        }),
    );

    const onConversationUpdated = vi.fn();
    const { result, rerender, unmount } = renderHook(
      ({ conversationId }) =>
        useCommunicationReply({
          orgId: 'org-1',
          conversationId,
          onConversationUpdated,
        }),
      { initialProps: { conversationId: 'conv-a' } },
    );

    act(() => {
      result.current.setDraft('Hello');
    });

    let sendPromise: Promise<unknown>;
    act(() => {
      sendPromise = result.current.send();
    });

    rerender({ conversationId: 'conv-b' });
    act(() => {
      result.current.setDraft('Other draft');
    });

    await act(async () => {
      resolveReply?.({
        sendState: 'ACCEPTED',
        conversation: {
          id: 'conv-a',
          channel: 'WHATSAPP',
          status: 'WAITING_CUSTOMER',
          unreadCount: 0,
          lastActivityAt: '2026-08-22T12:00:00.000Z',
          displayLabel: 'A',
          customer: null,
          booking: null,
          vehicle: null,
          station: null,
          assignedUser: null,
          assignedAgent: null,
          createdAt: '2026-08-20T08:00:00.000Z',
          updatedAt: '2026-08-22T12:00:00.000Z',
        },
        event: null,
        commandId: 'cmd-1',
      });
      await sendPromise;
    });

    expect(onConversationUpdated).not.toHaveBeenCalled();
    expect(result.current.draft).toBe('Other draft');
    unmount();
  });
});
