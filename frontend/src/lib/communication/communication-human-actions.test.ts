import { describe, expect, it } from 'vitest';
import { resolveCommunicationHumanActions } from './communication-human-actions';
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

describe('resolveCommunicationHumanActions', () => {
  it('returns no actions for read-only users', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation(),
      canWrite: false,
      canManage: false,
      currentUserId: 'user-a',
    });
    expect(result.canClaim).toBe(false);
    expect(result.canOpenMemberPicker).toBe(false);
  });

  it('allows claim for unassigned HUMAN_REQUIRED write user', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({ status: 'HUMAN_REQUIRED', assignedUser: null }),
      canWrite: true,
      canManage: false,
      currentUserId: 'user-a',
    });
    expect(result.canClaim).toBe(true);
    expect(result.canOpenMemberPicker).toBe(false);
    expect(result.ownershipKind).toBe('unassigned');
  });

  it('allows member picker for manager on active conversation', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({
        status: 'HUMAN_ACTIVE',
        assignedUser: { id: 'user-b', displayName: 'Operator B' },
      }),
      canWrite: true,
      canManage: true,
      currentUserId: 'user-a',
    });
    expect(result.canClaim).toBe(false);
    expect(result.canOpenMemberPicker).toBe(true);
    expect(result.canUnassign).toBe(true);
    expect(result.ownershipKind).toBe('assigned_to_other');
  });

  it('allows self-unassign for assigned write user', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({
        status: 'HUMAN_ACTIVE',
        assignedUser: { id: 'user-a', displayName: 'Me' },
      }),
      canWrite: true,
      canManage: false,
      currentUserId: 'user-a',
    });
    expect(result.canUnassign).toBe(true);
    expect(result.canOpenMemberPicker).toBe(false);
    expect(result.ownershipKind).toBe('assigned_to_me');
  });

  it('blocks assignment picker for normal user on other-owned conversation', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({
        status: 'HUMAN_ACTIVE',
        assignedUser: { id: 'user-b', displayName: 'Operator B' },
      }),
      canWrite: true,
      canManage: false,
      currentUserId: 'user-a',
    });
    expect(result.canOpenMemberPicker).toBe(false);
    expect(result.canUnassign).toBe(false);
  });

  it('allows reopen on resolved conversation without assignment actions', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({
        status: 'RESOLVED',
        assignedUser: { id: 'user-a', displayName: 'Me' },
      }),
      canWrite: true,
      canManage: true,
      currentUserId: 'user-a',
    });
    expect(result.canReopen).toBe(true);
    expect(result.canOpenMemberPicker).toBe(false);
    expect(result.isTerminal).toBe(true);
  });

  it('allows self take-over for unassigned AI_ACTIVE', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({ status: 'AI_ACTIVE', assignedUser: null }),
      canWrite: true,
      canManage: false,
      currentUserId: 'user-a',
    });
    expect(result.canClaim).toBe(false);
    expect(result.canTakeOverSelf).toBe(true);
    expect(result.ownershipKind).toBe('non_human');
  });

  it('keeps resolve available while waiting on customer with assignee', () => {
    const result = resolveCommunicationHumanActions({
      conversation: conversation({
        status: 'WAITING_CUSTOMER',
        assignedUser: { id: 'user-a', displayName: 'Me' },
      }),
      canWrite: true,
      canManage: false,
      currentUserId: 'user-a',
    });
    expect(result.canResolve).toBe(true);
    expect(result.ownershipKind).toBe('assigned_to_me');
  });
});
