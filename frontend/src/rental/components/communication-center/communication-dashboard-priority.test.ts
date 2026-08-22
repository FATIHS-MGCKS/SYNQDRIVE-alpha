import { describe, expect, it } from 'vitest';
import type { CommunicationConversationListItem } from '../../../lib/communication/types';
import {
  dashboardCommunicationNeedsAttention,
  getDashboardConversationPriorityTier,
  prioritizeDashboardConversations,
} from './communication-dashboard-priority';

function row(
  partial: Partial<CommunicationConversationListItem> & Pick<CommunicationConversationListItem, 'id'>,
): CommunicationConversationListItem {
  return {
    channel: 'WHATSAPP',
    status: 'AI_ACTIVE',
    unreadCount: 0,
    lastActivityAt: '2026-08-22T10:00:00.000Z',
    displayLabel: partial.id,
    ...partial,
  };
}

describe('communication-dashboard-priority', () => {
  it('orders conversations by tier then lastActivityAt desc then id', () => {
    const items = [
      row({ id: 'c-unread', unreadCount: 2, lastActivityAt: '2026-08-22T09:00:00.000Z' }),
      row({
        id: 'c-human',
        status: 'HUMAN_REQUIRED',
        lastActivityAt: '2026-08-22T08:00:00.000Z',
      }),
      row({
        id: 'c-unread-unassigned',
        unreadCount: 1,
        assignedUser: null,
        lastActivityAt: '2026-08-22T11:00:00.000Z',
      }),
      row({
        id: 'c-unassigned',
        assignedUser: null,
        lastActivityAt: '2026-08-22T12:00:00.000Z',
      }),
      row({ id: 'c-resolved', status: 'RESOLVED', unreadCount: 0 }),
    ];

    const prioritized = prioritizeDashboardConversations(items, 5).map((item) => item.id);
    expect(prioritized).toEqual([
      'c-human',
      'c-unread-unassigned',
      'c-unread',
      'c-unassigned',
    ]);
  });

  it('dedupes conversations by id', () => {
    const duplicate = row({ id: 'dup', status: 'HUMAN_REQUIRED' });
    const prioritized = prioritizeDashboardConversations([duplicate, duplicate], 5);
    expect(prioritized).toHaveLength(1);
  });

  it('returns no rows when nothing needs attention', () => {
    const items = [
      row({ id: 'resolved', status: 'RESOLVED' }),
      row({ id: 'read', unreadCount: 0, assignedUser: { id: 'u1', displayName: 'Ops' } }),
    ];
    expect(prioritizeDashboardConversations(items)).toEqual([]);
    expect(getDashboardConversationPriorityTier(items[0]!)).toBeNull();
  });

  it('detects summary attention state', () => {
    expect(
      dashboardCommunicationNeedsAttention({
        totalUnreadMessages: 0,
        unreadConversations: 0,
        unassigned: 0,
        requiresAttention: 0,
        byChannel: {},
      }),
    ).toBe(false);
    expect(
      dashboardCommunicationNeedsAttention({
        totalUnreadMessages: 1,
        unreadConversations: 1,
        unassigned: 0,
        requiresAttention: 0,
        byChannel: {},
      }),
    ).toBe(true);
  });
});
