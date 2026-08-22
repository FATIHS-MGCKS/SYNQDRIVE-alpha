import type { CommunicationConversationDetail } from '../../../lib/communication/types';

export function conversationHasContext(
  conversation: CommunicationConversationDetail | null | undefined,
): boolean {
  if (!conversation) return false;
  return Boolean(
    conversation.customer ||
      conversation.booking ||
      conversation.vehicle ||
      conversation.station ||
      conversation.assignedUser ||
      conversation.assignedAgent,
  );
}
