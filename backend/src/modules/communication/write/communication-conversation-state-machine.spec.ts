import { CommunicationConversationStatus } from '@prisma/client';
import {
  assertOperatorStatusTransition,
  isClaimEligibleStatus,
  isResolveEligibleStatus,
  resolveReopenTargetStatus,
  resolveUnassignTargetStatus,
} from './communication-conversation-state-machine';

describe('CommunicationConversationStateMachine', () => {
  it('allows operator resolve from active states', () => {
    for (const status of [
      CommunicationConversationStatus.HUMAN_ACTIVE,
      CommunicationConversationStatus.HUMAN_REQUIRED,
      CommunicationConversationStatus.AI_ACTIVE,
      CommunicationConversationStatus.WAITING_CUSTOMER,
    ]) {
      expect(() =>
        assertOperatorStatusTransition(status, CommunicationConversationStatus.RESOLVED),
      ).not.toThrow();
    }
  });

  it('rejects invalid operator transitions', () => {
    expect(() =>
      assertOperatorStatusTransition(
        CommunicationConversationStatus.RESOLVED,
        CommunicationConversationStatus.AI_ACTIVE,
      ),
    ).not.toThrow();

    expect(() =>
      assertOperatorStatusTransition(
        CommunicationConversationStatus.AI_ACTIVE,
        CommunicationConversationStatus.FAILED,
      ),
    ).toThrow();
  });

  it('freezes claim eligibility to HUMAN_REQUIRED', () => {
    expect(isClaimEligibleStatus(CommunicationConversationStatus.HUMAN_REQUIRED)).toBe(true);
    expect(isClaimEligibleStatus(CommunicationConversationStatus.HUMAN_ACTIVE)).toBe(false);
  });

  it('freezes resolve eligibility', () => {
    expect(isResolveEligibleStatus(CommunicationConversationStatus.FAILED)).toBe(false);
    expect(isResolveEligibleStatus(CommunicationConversationStatus.HUMAN_ACTIVE)).toBe(true);
  });

  it('reopen target prefers human assignment', () => {
    expect(
      resolveReopenTargetStatus('user-1', CommunicationConversationStatus.RESOLVED),
    ).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    expect(
      resolveReopenTargetStatus(null, CommunicationConversationStatus.RESOLVED),
    ).toBe(CommunicationConversationStatus.HUMAN_REQUIRED);
    expect(
      resolveReopenTargetStatus(null, CommunicationConversationStatus.FAILED),
    ).toBe(CommunicationConversationStatus.HUMAN_REQUIRED);
  });

  it('unassign always returns HUMAN_REQUIRED', () => {
    expect(resolveUnassignTargetStatus()).toBe(CommunicationConversationStatus.HUMAN_REQUIRED);
  });
});
