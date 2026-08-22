import { describe, expect, it } from 'vitest';

import {
  applyCommunicationChannelChange,
  applyCommunicationPrimaryTabChange,
  applyCommunicationSettingsSectionChange,
  DEFAULT_COMMUNICATION_CENTER_URL_STATE,
  mergeCommunicationCenterState,
  normalizeCommunicationPrimaryTab,
  normalizeCommunicationSettingsSection,
  parseCommunicationCenterViewFromUrl,
  readCommunicationCenterStateFromUrl,
} from './communication-center-navigation';
import { mergeCommunicationInboxFilters } from './communication-inbox-state';

describe('communication-center-navigation', () => {
  it('detects communication center view from URL', () => {
    expect(parseCommunicationCenterViewFromUrl('?view=communication-center')).toBe(true);
    expect(parseCommunicationCenterViewFromUrl('?view=dashboard')).toBe(false);
  });

  it('preserves settings tab after C8.4', () => {
    expect(normalizeCommunicationPrimaryTab('settings')).toBe('settings');
    expect(normalizeCommunicationPrimaryTab('inbox')).toBe('inbox');
  });

  it('normalizes invalid settings section to overview', () => {
    expect(normalizeCommunicationSettingsSection('foo')).toBe('overview');
    expect(normalizeCommunicationSettingsSection('voice')).toBe('voice');
  });

  it('parses channel, conversation, settings, and mobile pane params', () => {
    expect(
      readCommunicationCenterStateFromUrl(
        '?communicationTab=settings&communicationSettings=voice&communicationChannel=whatsapp&conversationId=conv-1&communicationPane=context',
      ),
    ).toEqual({
      primaryTab: 'settings',
      settingsSection: 'voice',
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
      settingsSection: 'overview',
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

  it('switches primary tab to settings', () => {
    const next = applyCommunicationPrimaryTabChange(DEFAULT_COMMUNICATION_CENTER_URL_STATE, 'settings');
    expect(next.primaryTab).toBe('settings');
  });

  it('switches settings section and forces settings tab', () => {
    const next = applyCommunicationSettingsSectionChange(
      DEFAULT_COMMUNICATION_CENTER_URL_STATE,
      'whatsapp',
    );
    expect(next).toEqual({
      ...DEFAULT_COMMUNICATION_CENTER_URL_STATE,
      primaryTab: 'settings',
      settingsSection: 'whatsapp',
    });
  });
});
