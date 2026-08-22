import { describe, expect, it } from 'vitest';
import type { CommunicationConversationListItem } from '../../../lib/communication/types';
import {
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

describe('communication-dashboard-priority global window regression', () => {
  it('fails when HUMAN_REQUIRED is outside an arbitrary recent candidate window', () => {
    const recentWindow = Array.from({ length: 30 }, (_, index) =>
      row({
        id: `recent-${index}`,
        unreadCount: index % 2 === 0 ? 1 : 0,
        assignedUser: index % 3 === 0 ? null : { id: 'u1', displayName: 'Ops' },
        lastActivityAt: new Date(Date.parse('2026-08-22T12:00:00.000Z') + index * 60_000).toISOString(),
      }),
    );

    const humanOutsideWindow = row({
      id: 'human-outside-window',
      status: 'HUMAN_REQUIRED',
      lastActivityAt: '2026-08-21T08:00:00.000Z',
    });

    const windowOnly = prioritizeDashboardConversations(recentWindow, 5).map((item) => item.id);
    const withGlobal = prioritizeDashboardConversations(
      [...recentWindow, humanOutsideWindow],
      5,
    ).map((item) => item.id);

    expect(windowOnly).not.toContain('human-outside-window');
    expect(withGlobal[0]).toBe('human-outside-window');
    expect(getDashboardConversationPriorityTier(humanOutsideWindow)).toBe(1);
  });
});
