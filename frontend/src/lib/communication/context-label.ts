import type { CommunicationConversationListItem } from './types';

/** One concise operational context line for inbox rows. */
export function buildConversationContextLabel(
  conversation: CommunicationConversationListItem,
): string | null {
  const parts: string[] = [];
  if (conversation.booking?.reference) {
    parts.push(conversation.booking.reference);
  }
  if (conversation.vehicle?.displayLabel) {
    parts.push(conversation.vehicle.displayLabel);
  } else if (conversation.station?.name) {
    parts.push(conversation.station.name);
  }
  if (parts.length === 0) return null;
  return parts.join(' · ');
}
