import type { CommunicationConversationListItem } from './types';

/** Defensive dedupe when flattening cursor pages — preserves first-seen order. */
export function dedupeConversationsById(
  items: CommunicationConversationListItem[],
): CommunicationConversationListItem[] {
  const seen = new Set<string>();
  const result: CommunicationConversationListItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
