import type { CommunicationConversationDetail } from './types';
import { resolveCommunicationConversationActions } from './communication-actions';

export type CommunicationOwnershipKind =
  | 'unassigned'
  | 'assigned_to_me'
  | 'assigned_to_other'
  | 'resolved'
  | 'failed'
  | 'non_human';

export interface CommunicationHumanActions {
  ownershipKind: CommunicationOwnershipKind;
  assigneeDisplayName: string | null;
  canClaim: boolean;
  canTakeOverSelf: boolean;
  canOpenMemberPicker: boolean;
  canLoadMemberDirectory: boolean;
  canUnassign: boolean;
  canResolve: boolean;
  canReopen: boolean;
  canMarkRead: boolean;
  isTerminal: boolean;
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set([
  'AI_ACTIVE',
  'WAITING_CUSTOMER',
  'HUMAN_REQUIRED',
  'HUMAN_ACTIVE',
]);

export function resolveCommunicationHumanActions(input: {
  conversation: CommunicationConversationDetail | null;
  canWrite: boolean;
  canManage: boolean;
  currentUserId: string | null;
  membersDirectoryAvailable?: boolean;
}): CommunicationHumanActions {
  const empty: CommunicationHumanActions = {
    ownershipKind: 'unassigned',
    assigneeDisplayName: null,
    canClaim: false,
    canTakeOverSelf: false,
    canOpenMemberPicker: false,
    canLoadMemberDirectory: false,
    canUnassign: false,
    canResolve: false,
    canReopen: false,
    canMarkRead: false,
    isTerminal: false,
  };

  if (!input.canWrite || !input.conversation) return empty;

  const { conversation, canManage, currentUserId } = input;
  const { status, assignedUser } = conversation;
  const assignedUserId = assignedUser?.id ?? null;
  const isAssignedToMe = Boolean(currentUserId && assignedUserId === currentUserId);
  const isAssignedToOther = Boolean(assignedUserId && !isAssignedToMe);
  const isUnassigned = !assignedUserId;
  const isTerminal = status === 'RESOLVED' || status === 'FAILED';

  let ownershipKind: CommunicationOwnershipKind = 'unassigned';
  if (status === 'RESOLVED') ownershipKind = 'resolved';
  else if (status === 'FAILED') ownershipKind = 'failed';
  else if (isAssignedToMe) ownershipKind = 'assigned_to_me';
  else if (isAssignedToOther) ownershipKind = 'assigned_to_other';
  else if (status === 'AI_ACTIVE' || status === 'WAITING_CUSTOMER') ownershipKind = 'non_human';
  else ownershipKind = 'unassigned';

  const lifecycleActions = resolveCommunicationConversationActions({
    conversation,
    canWrite: true,
  });

  const canClaim = isUnassigned && status === 'HUMAN_REQUIRED';
  const canTakeOverSelf =
    isUnassigned
    && (status === 'AI_ACTIVE' || status === 'WAITING_CUSTOMER');
  const canOpenMemberPicker =
    canManage
    && !isTerminal
    && ACTIVE_ASSIGNMENT_STATUSES.has(status)
    && input.membersDirectoryAvailable !== false;
  const canLoadMemberDirectory = canManage && input.membersDirectoryAvailable !== false;
  const canUnassign =
    !isTerminal
    && Boolean(assignedUserId)
    && (isAssignedToMe || canManage);

  return {
    ownershipKind,
    assigneeDisplayName: assignedUser?.displayName ?? null,
    canClaim,
    canTakeOverSelf,
    canOpenMemberPicker,
    canLoadMemberDirectory,
    canUnassign,
    canResolve: lifecycleActions.includes('resolve'),
    canReopen: lifecycleActions.includes('reopen'),
    canMarkRead: lifecycleActions.includes('markRead'),
    isTerminal,
  };
}
