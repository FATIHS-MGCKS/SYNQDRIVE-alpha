import { describe, expect, it } from 'vitest';
import {
  buildCommunicationCenterSearchParams,
  buildCommunicationCenterUrl,
} from './communication-center-url';
import {
  COMMUNICATION_CHANNEL_PARAM,
  COMMUNICATION_CONVERSATION_PARAM,
  COMMUNICATION_MOBILE_PANE_PARAM,
} from './communication-center-navigation';
import {
  COMMUNICATION_ASSIGNMENT_PARAM,
  COMMUNICATION_STATUS_PARAM,
  COMMUNICATION_UNREAD_PARAM,
} from './communication-inbox-state';

describe('communication-center-url', () => {
  it('builds inbox deep link for unread metric', () => {
    const params = buildCommunicationCenterSearchParams({
      inboxFilters: { unreadOnly: true },
    });
    expect(params.get('view')).toBe('communication-center');
    expect(params.get(COMMUNICATION_UNREAD_PARAM)).toBe('true');
    expect(params.get(COMMUNICATION_STATUS_PARAM)).toBeNull();
    expect(params.get(COMMUNICATION_ASSIGNMENT_PARAM)).toBeNull();
  });

  it('builds inbox deep link for human required metric', () => {
    const params = buildCommunicationCenterSearchParams({
      inboxFilters: { status: 'HUMAN_REQUIRED' },
    });
    expect(params.get(COMMUNICATION_STATUS_PARAM)).toBe('HUMAN_REQUIRED');
  });

  it('builds inbox deep link for unassigned metric', () => {
    const params = buildCommunicationCenterSearchParams({
      inboxFilters: { assignment: 'unassigned' },
    });
    expect(params.get(COMMUNICATION_ASSIGNMENT_PARAM)).toBe('unassigned');
  });

  it('builds conversation deep link with channel and mobile pane', () => {
    const url = buildCommunicationCenterUrl({
      conversationId: 'conv-123',
      channel: 'whatsapp',
      mobilePane: 'conversation',
    });
    const params = new URL(url, 'http://localhost').searchParams;
    expect(params.get(COMMUNICATION_CONVERSATION_PARAM)).toBe('conv-123');
    expect(params.get(COMMUNICATION_CHANNEL_PARAM)).toBe('whatsapp');
    expect(params.get(COMMUNICATION_MOBILE_PANE_PARAM)).toBe('conversation');
  });
});
