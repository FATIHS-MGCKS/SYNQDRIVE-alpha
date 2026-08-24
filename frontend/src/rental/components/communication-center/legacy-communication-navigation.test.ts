import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  COMMUNICATION_CHANNELS_PARAM,
  COMMUNICATION_CHANNEL_PARAM,
  COMMUNICATION_TAB_PARAM,
  COMMUNICATION_VOICE_INTENT_PARAM,
  COMMUNICATION_WHATSAPP_SUBVIEW_PARAM,
} from './communication-center-navigation';
import {
  applyResolvedLegacyCommunicationRoute,
  buildCommunicationCenterStateForVoiceIntent,
  isLegacyCommunicationView,
  redirectLegacyCommunicationRoute,
  resolveLegacyCommunicationRoute,
  sanitizeLegacyCommunicationParams,
} from './legacy-communication-navigation';

const CANONICAL_CONVERSATION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('legacy-communication-navigation', () => {
  it('detects legacy communication views', () => {
    expect(isLegacyCommunicationView('whatsapp-business')).toBe(true);
    expect(isLegacyCommunicationView('ai-voice-assistant')).toBe(true);
    expect(isLegacyCommunicationView('communication-center')).toBe(false);
  });

  describe('WhatsApp legacy routes', () => {
    it('redirects bare whatsapp-business to Channels WhatsApp overview', () => {
      const resolved = resolveLegacyCommunicationRoute('?view=whatsapp-business');
      expect(resolved).toMatchObject({
        view: 'communication-center',
        routeFamily: 'whatsapp',
        destinationClass: 'communication_channels_whatsapp',
        communicationCenterState: {
          primaryTab: 'channels',
          channelsSection: 'whatsapp',
          whatsappChannelSubview: 'overview',
        },
      });
    });

    it('redirects whatsapp inbox to operational Conversations', () => {
      const resolved = resolveLegacyCommunicationRoute('?view=whatsapp-business&tab=inbox');
      expect(resolved).toMatchObject({
        destinationClass: 'communication_operational',
        communicationCenterState: {
          primaryTab: 'inbox',
          channel: 'whatsapp',
        },
      });
    });

    it('redirects canonical conversation UUID to CC conversation', () => {
      const resolved = resolveLegacyCommunicationRoute(
        `?view=whatsapp-business&tab=inbox&conversationId=${CANONICAL_CONVERSATION_ID}`,
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'inbox',
        channel: 'whatsapp',
        selectedConversationId: CANONICAL_CONVERSATION_ID,
        mobilePane: 'conversation',
      });
    });

    it('falls back to channel inbox when conversation id is not a UUID', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=whatsapp-business&tab=inbox&conversationId=wa-native-123',
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'inbox',
        channel: 'whatsapp',
        selectedConversationId: null,
        mobilePane: 'inbox',
      });
    });

    it('redirects templates tab to Channels WhatsApp templates', () => {
      const resolved = resolveLegacyCommunicationRoute('?view=whatsapp-business&tab=templates');
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'channels',
        channelsSection: 'whatsapp',
        whatsappChannelSubview: 'templates',
      });
    });

    it('redirects settings tab to Channels WhatsApp configuration', () => {
      const resolved = resolveLegacyCommunicationRoute('?view=whatsapp-business&tab=settings');
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'channels',
        channelsSection: 'whatsapp',
        whatsappChannelSubview: 'configuration',
      });
    });

    it('maps legacy inbox filters to canonical inbox filters', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=whatsapp-business&tab=inbox&filter=unread&search=brake',
      );
      expect(resolved?.communicationCenterState?.inboxFilters).toMatchObject({
        unreadOnly: true,
        search: 'brake',
      });
    });
  });

  describe('Voice legacy routes', () => {
    it('redirects bare ai-voice-assistant to Channels Voice overview', () => {
      const resolved = resolveLegacyCommunicationRoute('?view=ai-voice-assistant');
      expect(resolved).toMatchObject({
        routeFamily: 'voice',
        destinationClass: 'voice_specialized_retained',
        communicationCenterState: {
          primaryTab: 'channels',
          channelsSection: 'voice',
          voiceIntent: 'overview',
        },
      });
    });

    it('redirects voice conversations to operational inbox', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceOpsTab=conversations',
      );
      expect(resolved).toMatchObject({
        destinationClass: 'communication_operational',
        communicationCenterState: {
          primaryTab: 'inbox',
          channel: 'voice',
        },
      });
    });

    it('redirects voice analytics to retained specialized surface', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceOpsTab=analytics',
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'channels',
        channelsSection: 'voice',
        voiceIntent: 'analytics',
      });
    });

    it('redirects voice test center to retained specialized surface', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceOpsTab=settings&voiceSettingsSection=test',
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'channels',
        channelsSection: 'voice',
        voiceIntent: 'test',
      });
    });

    it('redirects voice telephony to retained specialized surface', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceOpsTab=settings&voiceSettingsSection=telephony',
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        voiceIntent: 'telephony',
      });
    });

    it('redirects voice automations to CC automations tab', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceOpsTab=automations',
      );
      expect(resolved).toMatchObject({
        destinationClass: 'communication_automations',
        communicationCenterState: {
          primaryTab: 'automations',
          voiceIntent: 'automations',
        },
      });
    });
  });

  it('returns null for non-legacy views', () => {
    expect(resolveLegacyCommunicationRoute('?view=communication-center')).toBeNull();
    expect(resolveLegacyCommunicationRoute('?view=dashboard')).toBeNull();
  });

  it('sanitizes unknown legacy query params via allowlist', () => {
    const params = new URLSearchParams(
      '?view=whatsapp-business&tab=inbox&conversationId=abc&token=secret&phone=%2B491',
    );
    const sanitized = sanitizeLegacyCommunicationParams('whatsapp', params);
    expect(sanitized.get('view')).toBe('whatsapp-business');
    expect(sanitized.get('tab')).toBe('inbox');
    expect(sanitized.get('conversationId')).toBe('abc');
    expect(sanitized.get('token')).toBeNull();
    expect(sanitized.get('phone')).toBeNull();
  });

  it('builds canonical CC state for voice intents from communication callbacks', () => {
    expect(
      buildCommunicationCenterStateForVoiceIntent({ opsTab: 'analytics' }),
    ).toMatchObject({
      primaryTab: 'channels',
      channelsSection: 'voice',
      voiceIntent: 'analytics',
    });
    expect(
      buildCommunicationCenterStateForVoiceIntent({
        opsTab: 'settings',
        settingsSection: 'test',
      }),
    ).toMatchObject({
      voiceIntent: 'test',
    });
  });

  describe('URL application', () => {
    let replaceState: ReturnType<typeof vi.fn>;
    let href: { value: string };
    let search: { value: string };

    beforeEach(() => {
      replaceState = vi.fn((_state: unknown, _title: string, nextUrl: string) => {
        href.value = nextUrl.startsWith('http')
          ? nextUrl
          : `http://localhost${nextUrl.startsWith('/') ? '' : '/'}${nextUrl}`;
        const queryIndex = href.value.indexOf('?');
        search.value = queryIndex >= 0 ? href.value.slice(queryIndex) : '';
      });
      href = { value: 'http://localhost/rental' };
      search = { value: '' };
      vi.stubGlobal('window', {
        location: {
          get href() {
            return href.value;
          },
          get search() {
            return search.value;
          },
        },
        history: {
          replaceState,
          pushState: vi.fn(),
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('uses replaceState for legacy redirects', () => {
      window.history.replaceState({}, '', '/rental?view=whatsapp-business&tab=templates');
      const resolved = redirectLegacyCommunicationRoute(window.location.search, { replace: true });
      expect(resolved?.destinationClass).toBe('communication_channels_whatsapp');
      expect(replaceState).toHaveBeenCalled();
      const nextUrl = String(replaceState.mock.calls.at(-1)?.[2] ?? '');
      expect(nextUrl).toContain('view=communication-center');
      expect(nextUrl).toContain(`${COMMUNICATION_TAB_PARAM}=channels`);
      expect(nextUrl).toContain(`${COMMUNICATION_CHANNELS_PARAM}=whatsapp`);
      expect(nextUrl).toContain(`${COMMUNICATION_WHATSAPP_SUBVIEW_PARAM}=templates`);
    });

    it('writes voice analytics intent into canonical URL', () => {
      window.history.replaceState({}, '', '/rental?view=ai-voice-assistant&voiceOpsTab=analytics');
      applyResolvedLegacyCommunicationRoute(
        resolveLegacyCommunicationRoute(window.location.search)!,
        { replace: true },
      );
      const nextUrl = String(replaceState.mock.calls.at(-1)?.[2] ?? '');
      expect(nextUrl).toContain('view=communication-center');
      expect(nextUrl).toContain(`${COMMUNICATION_VOICE_INTENT_PARAM}=analytics`);
      expect(nextUrl).toContain(`${COMMUNICATION_CHANNEL_PARAM}=voice`);
    });

    it('does not leave legacy view param after redirect', () => {
      window.history.replaceState({}, '', '/rental?view=whatsapp-business&tab=inbox');
      redirectLegacyCommunicationRoute(window.location.search, { replace: true });
      const nextUrl = String(replaceState.mock.calls.at(-1)?.[2] ?? '');
      expect(nextUrl).not.toContain('whatsapp-business');
      expect(nextUrl).toContain(`${COMMUNICATION_CHANNEL_PARAM}=whatsapp`);
    });
  });
});
