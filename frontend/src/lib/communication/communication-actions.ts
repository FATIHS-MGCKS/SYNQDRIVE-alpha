import type { CommunicationApiStatus, CommunicationConversationDetail } from './types';

export type CommunicationConversationAction =
  | 'claim'
  | 'resolve'
  | 'reopen'
  | 'markRead';

export function resolveCommunicationConversationActions(input: {
  conversation: CommunicationConversationDetail | null;
  canWrite: boolean;
}): CommunicationConversationAction[] {
  if (!input.canWrite || !input.conversation) return [];

  const actions: CommunicationConversationAction[] = [];
  const { status, unreadCount, assignedUser } = input.conversation;

  if (status === 'HUMAN_REQUIRED' && !assignedUser) {
    actions.push('claim');
  }
  if (status === 'HUMAN_ACTIVE' || status === 'HUMAN_REQUIRED' || status === 'AI_ACTIVE' || status === 'WAITING_CUSTOMER') {
    actions.push('resolve');
  }
  if (status === 'RESOLVED' || status === 'FAILED') {
    actions.push('reopen');
  }
  if (unreadCount > 0) {
    actions.push('markRead');
  }

  return actions;
}

export function isCommunicationStatus(value: string): value is CommunicationApiStatus {
  return [
    'AI_ACTIVE',
    'WAITING_CUSTOMER',
    'HUMAN_REQUIRED',
    'HUMAN_ACTIVE',
    'RESOLVED',
    'FAILED',
  ].includes(value);
}
