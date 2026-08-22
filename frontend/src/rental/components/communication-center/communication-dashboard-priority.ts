import type { CommunicationConversationListItem } from '../../../lib/communication/types';
import type { CommunicationConversationSummary } from '../../../lib/communication/types';

export const DASHBOARD_COMMUNICATION_ROW_LIMIT = 5;
export const DASHBOARD_COMMUNICATION_CANDIDATE_LIMIT = 30;

export type DashboardConversationPriorityTier = 1 | 2 | 3 | 4;

const TERMINAL_CONVERSATION_STATUSES = new Set<CommunicationConversationListItem['status']>([
  'RESOLVED',
  'FAILED',
]);

function isTerminalConversationStatus(
  status: CommunicationConversationListItem['status'],
): boolean {
  return TERMINAL_CONVERSATION_STATUSES.has(status);
}

export function getDashboardConversationPriorityTier(
  conversation: CommunicationConversationListItem,
): DashboardConversationPriorityTier | null {
  const isUnread = conversation.unreadCount > 0;
  const isUnassigned = !conversation.assignedUser;
  const isHumanRequired = conversation.status === 'HUMAN_REQUIRED';
  const isTerminal = isTerminalConversationStatus(conversation.status);

  if (isHumanRequired) return 1;
  if (isTerminal && !isUnread) return null;
  if (isUnread && isUnassigned) return 2;
  if (isUnread) return 3;
  if (isUnassigned && !isTerminal) return 4;
  return null;
}

export function prioritizeDashboardConversations(
  items: CommunicationConversationListItem[],
  limit = DASHBOARD_COMMUNICATION_ROW_LIMIT,
): CommunicationConversationListItem[] {
  const seen = new Set<string>();
  const ranked = items
    .map((item) => ({
      item,
      tier: getDashboardConversationPriorityTier(item),
    }))
    .filter(
      (
        entry,
      ): entry is {
        item: CommunicationConversationListItem;
        tier: DashboardConversationPriorityTier;
      } => entry.tier !== null,
    );

  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const activityDelta =
      Date.parse(b.item.lastActivityAt) - Date.parse(a.item.lastActivityAt);
    if (activityDelta !== 0) return activityDelta;
    return a.item.id.localeCompare(b.item.id);
  });

  const result: CommunicationConversationListItem[] = [];
  for (const { item } of ranked) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function dashboardCommunicationNeedsAttention(
  summary: CommunicationConversationSummary | null,
): boolean {
  if (!summary) return false;
  return (
    summary.unreadConversations > 0 ||
    summary.requiresAttention > 0 ||
    summary.unassigned > 0
  );
}
