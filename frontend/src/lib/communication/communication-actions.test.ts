import { describe, expect, it } from 'vitest';
import { resolveCommunicationConversationActions } from './communication-actions';
import type { CommunicationConversationDetail } from './types';

function conversation(
  overrides: Partial<CommunicationConversationDetail> = {},
): CommunicationConversationDetail {
  return {
    id: 'conv-1',
    channel: 'WHATSAPP',
    status: 'HUMAN_REQUIRED',
    unreadCount: 0,
    lastActivityAt: '2026-08-22T10:00:00.000Z',
    displayLabel: 'Test',
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('resolveCommunicationConversationActions', () => {
  it('returns no actions for read-only users', () => {
    expect(
      resolveCommunicationConversationActions({
        conversation: conversation(),
        canWrite: false,
      }),
    ).toEqual([]);
  });

  it('shows resolve for HUMAN_REQUIRED unassigned', () => {
    const actions = resolveCommunicationConversationActions({
      conversation: conversation({ status: 'HUMAN_REQUIRED', assignedUser: null }),
      canWrite: true,
    });
    expect(actions).toContain('resolve');
    expect(actions).not.toContain('claim' as never);
  });

  it('shows resolve for HUMAN_ACTIVE', () => {
    const actions = resolveCommunicationConversationActions({
      conversation: conversation({ status: 'HUMAN_ACTIVE' }),
      canWrite: true,
    });
    expect(actions).toContain('resolve');
    expect(actions).not.toContain('claim');
  });

  it('shows reopen for RESOLVED', () => {
    expect(
      resolveCommunicationConversationActions({
        conversation: conversation({ status: 'RESOLVED' }),
        canWrite: true,
      }),
    ).toContain('reopen');
  });

  it('shows mark read when unread', () => {
    expect(
      resolveCommunicationConversationActions({
        conversation: conversation({ unreadCount: 2 }),
        canWrite: true,
      }),
    ).toContain('markRead');
  });
});
