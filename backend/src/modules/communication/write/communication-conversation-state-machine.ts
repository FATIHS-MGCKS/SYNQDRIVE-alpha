import { CommunicationConversationStatus } from '@prisma/client';
import { CommunicationWriteError } from './communication-write.errors';

/** Terminal canonical statuses — reopen requires explicit operator action. */
export const TERMINAL_COMMUNICATION_STATUSES: CommunicationConversationStatus[] = [
  CommunicationConversationStatus.RESOLVED,
  CommunicationConversationStatus.FAILED,
];

/** Operator-authorized status transitions (frozen C11.1 matrix). */
const OPERATOR_STATUS_TRANSITIONS: Record<
  CommunicationConversationStatus,
  CommunicationConversationStatus[]
> = {
  [CommunicationConversationStatus.AI_ACTIVE]: [
    CommunicationConversationStatus.WAITING_CUSTOMER,
    CommunicationConversationStatus.HUMAN_REQUIRED,
    CommunicationConversationStatus.HUMAN_ACTIVE,
    CommunicationConversationStatus.RESOLVED,
  ],
  [CommunicationConversationStatus.WAITING_CUSTOMER]: [
    CommunicationConversationStatus.AI_ACTIVE,
    CommunicationConversationStatus.HUMAN_REQUIRED,
    CommunicationConversationStatus.HUMAN_ACTIVE,
    CommunicationConversationStatus.RESOLVED,
  ],
  [CommunicationConversationStatus.HUMAN_REQUIRED]: [
    CommunicationConversationStatus.HUMAN_ACTIVE,
    CommunicationConversationStatus.RESOLVED,
  ],
  [CommunicationConversationStatus.HUMAN_ACTIVE]: [
    CommunicationConversationStatus.WAITING_CUSTOMER,
    CommunicationConversationStatus.AI_ACTIVE,
    CommunicationConversationStatus.HUMAN_REQUIRED,
    CommunicationConversationStatus.RESOLVED,
  ],
  [CommunicationConversationStatus.RESOLVED]: [
    CommunicationConversationStatus.AI_ACTIVE,
    CommunicationConversationStatus.HUMAN_REQUIRED,
    CommunicationConversationStatus.HUMAN_ACTIVE,
  ],
  [CommunicationConversationStatus.FAILED]: [
    CommunicationConversationStatus.HUMAN_REQUIRED,
  ],
};

export function assertOperatorStatusTransition(
  from: CommunicationConversationStatus,
  to: CommunicationConversationStatus,
): void {
  const allowed = OPERATOR_STATUS_TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw CommunicationWriteError.invalidTransition(from, to);
  }
}

export function isTerminalStatus(status: CommunicationConversationStatus): boolean {
  return TERMINAL_COMMUNICATION_STATUSES.includes(status);
}

/** Statuses from which an operator may claim an unassigned thread. */
export function isClaimEligibleStatus(status: CommunicationConversationStatus): boolean {
  return status === CommunicationConversationStatus.HUMAN_REQUIRED;
}

/** Statuses from which explicit human takeover converges to HUMAN_ACTIVE. */
export function isHumanTakeoverEligibleStatus(status: CommunicationConversationStatus): boolean {
  return (
    status === CommunicationConversationStatus.AI_ACTIVE
    || status === CommunicationConversationStatus.WAITING_CUSTOMER
  );
}

/** Statuses from which resolve is permitted. */
export function isResolveEligibleStatus(status: CommunicationConversationStatus): boolean {
  return (
    status === CommunicationConversationStatus.HUMAN_ACTIVE
    || status === CommunicationConversationStatus.HUMAN_REQUIRED
    || status === CommunicationConversationStatus.AI_ACTIVE
    || status === CommunicationConversationStatus.WAITING_CUSTOMER
  );
}

/** Deterministic reopen target — never accepts client-supplied status. */
export function resolveReopenTargetStatus(
  assignedUserId: string | null | undefined,
  previousStatus: CommunicationConversationStatus,
): CommunicationConversationStatus {
  if (previousStatus === CommunicationConversationStatus.FAILED) {
    return CommunicationConversationStatus.HUMAN_REQUIRED;
  }
  if (assignedUserId) {
    return CommunicationConversationStatus.HUMAN_ACTIVE;
  }
  return CommunicationConversationStatus.HUMAN_REQUIRED;
}

/** Unassign invariant: HUMAN_ACTIVE without assignee is invalid. */
export function resolveUnassignTargetStatus(): CommunicationConversationStatus {
  return CommunicationConversationStatus.HUMAN_REQUIRED;
}
