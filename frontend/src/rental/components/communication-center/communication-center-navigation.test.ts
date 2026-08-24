import { describe, expect, it } from 'vitest';

import {
  applyCommunicationChannelChange,
  applyCommunicationChannelsSectionChange,
  applyCommunicationOpenConversations,
  applyCommunicationPrimaryTabChange,
  applyCommunicationSettingsSectionChange,
  DEFAULT_COMMUNICATION_CENTER_URL_STATE,
  mergeCommunicationCenterState,
  normalizeCommunicationChannelsSection,
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
    expect(normalizeCommunicationPrimaryTab('channels')).toBe('channels');
    expect(normalizeCommunicationPrimaryTab('automations')).toBe('automations');
    expect(normalizeCommunicationPrimaryTab('inbox')).toBe('inbox');
  });

  it('normalizes invalid channels section to overview', () => {
    expect(normalizeCommunicationChannelsSection('foo')).toBe('overview');
    expect(normalizeCommunicationChannelsSection('email')).toBe('email');
  });

  it('normalizes invalid settings section to overview', () => {
    expect(normalizeCommunicationSettingsSection('foo')).toBe('overview');
    expect(normalizeCommunicationSettingsSection('voice')).toBe('voice');
  });

  it('parses channel, conversation, settings, channels, and mobile pane params', () => {
    expect(
      readCommunicationCenterStateFromUrl(
        '?communicationTab=channels&communicationChannels=whatsapp&communicationChannel=whatsapp&conversationId=conv-1&communicationPane=context',
      ),
    ).toEqual({
      primaryTab: 'channels',
      channelsSection: 'whatsapp',
      channel: 'whatsapp',
      selectedConversationId: 'conv-1',
      mobilePane: 'context',
      inboxFilters: mergeCommunicationInboxFilters(),
    });
  });

  it('parses WhatsApp channel subview and voice intent params', () => {
    expect(
      readCommunicationCenterStateFromUrl(
        '?communicationTab=channels&communicationChannels=voice&communicationVoiceIntent=analytics',
      ),
    ).toEqual({
      primaryTab: 'channels',
      channelsSection: 'voice',
      voiceIntent: 'analytics',
      inboxFilters: mergeCommunicationInboxFilters(),
    });
    expect(
      readCommunicationCenterStateFromUrl(
        '?communicationTab=channels&communicationChannels=whatsapp&communicationWhatsAppSubview=templates',
      ),
    ).toMatchObject({
      primaryTab: 'channels',
      channelsSection: 'whatsapp',
      whatsappChannelSubview: 'templates',
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
      channelsSection: 'overview',
      channel: 'sms',
      selectedConversationId: null,
      mobilePane: 'inbox',
      inboxFilters: mergeCommunicationInboxFilters(),
      whatsappChannelSubview: 'overview',
      voiceIntent: null,
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

  it('switches channels section and forces channels tab', () => {
    const next = applyCommunicationChannelsSectionChange(
      DEFAULT_COMMUNICATION_CENTER_URL_STATE,
      'voice',
    );
    expect(next).toEqual({
      ...DEFAULT_COMMUNICATION_CENTER_URL_STATE,
      primaryTab: 'channels',
      channelsSection: 'voice',
    });
  });

  it('opens conversations with channel filter from channels context', () => {
    const next = applyCommunicationOpenConversations(
      {
        ...DEFAULT_COMMUNICATION_CENTER_URL_STATE,
        primaryTab: 'channels',
        channelsSection: 'voice',
      },
      'voice',
    );
    expect(next.primaryTab).toBe('inbox');
    expect(next.channel).toBe('voice');
    expect(next.selectedConversationId).toBeNull();
  });
});
