import type { CommunicationConversationDetail } from './types';

export const COMMUNICATION_REPLY_TEXT_MAX_LENGTH = 4096;

export type CommunicationComposerBlockReason =
  | 'READ_ONLY'
  | 'CHANNEL_UNSUPPORTED'
  | 'CHANNEL_NOT_CONFIGURED'
  | 'RESOLVED'
  | 'FAILED'
  | 'OWNED_BY_OTHER';

export type CommunicationComposerState =
  | { mode: 'hidden'; reason: CommunicationComposerBlockReason }
  | { mode: 'enabled' }
  | { mode: 'blocked'; reason: CommunicationComposerBlockReason };

export function resolveCommunicationComposerState(input: {
  canWrite: boolean;
  conversation: CommunicationConversationDetail | null | undefined;
  currentUserId?: string | null;
}): CommunicationComposerState {
  if (!input.canWrite) {
    return { mode: 'hidden', reason: 'READ_ONLY' };
  }

  const conversation = input.conversation;
  if (!conversation) {
    return { mode: 'hidden', reason: 'READ_ONLY' };
  }

  if (conversation.channel === 'VOICE') {
    return { mode: 'hidden', reason: 'CHANNEL_UNSUPPORTED' };
  }

  if (conversation.channel === 'SMS') {
    return { mode: 'blocked', reason: 'CHANNEL_NOT_CONFIGURED' };
  }

  if (conversation.status === 'RESOLVED') {
    return { mode: 'hidden', reason: 'RESOLVED' };
  }

  if (conversation.status === 'FAILED') {
    return { mode: 'hidden', reason: 'FAILED' };
  }

  if (
    conversation.assignedUser
    && input.currentUserId
    && conversation.assignedUser.id !== input.currentUserId
  ) {
    return { mode: 'blocked', reason: 'OWNED_BY_OTHER' };
  }

  return { mode: 'enabled' };
}
