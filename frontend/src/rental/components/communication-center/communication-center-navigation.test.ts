import { describe, expect, it } from 'vitest';

import {
  applyCommunicationChannelChange,
  DEFAULT_COMMUNICATION_CENTER_URL_STATE,
  mergeCommunicationCenterState,
  normalizeCommunicationPrimaryTab,
  parseCommunicationCenterViewFromUrl,
  readCommunicationCenterStateFromUrl,
} from './communication-center-navigation';
import { mergeCommunicationInboxFilters } from './communication-inbox-state';

describe('communication-center-navigation', () => {
  it('detects communication center view from URL', () => {
    expect(parseCommunicationCenterViewFromUrl('?view=communication-center')).toBe(true);
    expect(parseCommunicationCenterViewFromUrl('?view=dashboard')).toBe(false);
  });

  it('normalizes settings tab to inbox before C8.4', () => {
    expect(normalizeCommunicationPrimaryTab('settings')).toBe('inbox');
    expect(normalizeCommunicationPrimaryTab('inbox')).toBe('inbox');
  });

  it('parses channel, conversation, and mobile pane params', () => {
    expect(
      readCommunicationCenterStateFromUrl(
        '?communicationTab=settings&communicationChannel=whatsapp&conversationId=conv-1&communicationPane=context',
      ),
    ).toEqual({
      primaryTab: 'inbox',
      channel: 'whatsapp',
      selectedConversationId: 'conv-1',
      mobilePane: 'context',
      inboxFilters: mergeCommunicationInboxFilters(),
    });
  });

  it('defaults to inbox/all with no conversation', () => {
    expect(mergeCommunicationCenterState({})).toEqual(DEFAULT_COMMUNICATION_CENTER_URL_STATE);
  });

  it('infers conversation mobile pane when conversation id is present', () => {
    expect(readCommunicationCenterStateFromUrl('?conversationId=conv-2')).toEqual({
      selectedConversationId: 'conv-2',
      mobilePane: 'conversation',
      inboxFilters: mergeCommunicationInboxFilters(),
    });
  });

  it('clears selection and mobile pane when channel changes', () => {
    const next = applyCommunicationChannelChange(
      {
        ...DEFAULT_COMMUNICATION_CENTER_URL_STATE,
        channel: 'whatsapp',
        selectedConversationId: 'conv-1',
        mobilePane: 'conversation',
      },
      'sms',
    );
    expect(next).toEqual({
      primaryTab: 'inbox',
      channel: 'sms',
      selectedConversationId: null,
      mobilePane: 'inbox',
      inboxFilters: mergeCommunicationInboxFilters(),
    });
  });

  it('does not mutate state when channel is unchanged', () => {
    const current = {
      ...DEFAULT_COMMUNICATION_CENTER_URL_STATE,
      channel: 'voice' as const,
      selectedConversationId: 'conv-1',
    };
    expect(applyCommunicationChannelChange(current, 'voice')).toBe(current);
  });
});
