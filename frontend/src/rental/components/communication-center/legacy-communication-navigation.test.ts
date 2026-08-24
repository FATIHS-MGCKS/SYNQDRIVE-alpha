import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  COMMUNICATION_CHANNELS_PARAM,
  COMMUNICATION_CHANNEL_PARAM,
  COMMUNICATION_TAB_PARAM,
  COMMUNICATION_VOICE_INTENT_PARAM,
  COMMUNICATION_VOICE_WIZARD_STEP_PARAM,
  COMMUNICATION_WHATSAPP_SUBVIEW_PARAM,
} from './communication-center-navigation';
import { COMMUNICATION_SEARCH_PARAM, COMMUNICATION_UNREAD_PARAM } from './communication-inbox-state';
import { VOICE_OPS_TAB_PARAM, VOICE_SETTINGS_SECTION_PARAM } from '../voice-assistant/voice-assistant-navigation';
import {
  applyResolvedLegacyCommunicationRoute,
  buildCommunicationCenterStateForVoiceIntent,
  isLegacyCommunicationView,
  LEGACY_COMMUNICATION_QUERY_PARAM_KEYS,
  redirectLegacyCommunicationRoute,
  resolveLegacyCommunicationRoute,
  mapVoiceIntentToAssistantState,
  mapVoiceAssistantStateToCanonicalVoiceIntent,
} from './legacy-communication-navigation';

const CANONICAL_CONVERSATION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function parseFinalUrl(nextUrl: string): URLSearchParams {
  const queryIndex = nextUrl.indexOf('?');
  const search = queryIndex >= 0 ? nextUrl.slice(queryIndex) : '';
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

describe('legacy-communication-navigation', () => {
  it('detects legacy communication views', () => {
    expect(isLegacyCommunicationView('whatsapp-business')).toBe(true);
    expect(isLegacyCommunicationView('ai-voice-assistant')).toBe(true);
    expect(isLegacyCommunicationView('communication-center')).toBe(false);
  });

  describe('WhatsApp legacy routes', () => {
    it('redirects bare whatsapp-business to Channels WhatsApp overview (historical default tab)', () => {
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

    it('documents bare whatsapp-business preserves WhatsAppBusinessView overview default', () => {
      // WhatsAppBusinessView initializes tab state to 'overview' — not inbox.
      const resolved = resolveLegacyCommunicationRoute('?view=whatsapp-business');
      expect(resolved?.destinationClass).toBe('communication_channels_whatsapp');
      expect(resolved?.communicationCenterState?.primaryTab).toBe('channels');
      expect(resolved?.communicationCenterState?.whatsappChannelSubview).toBe('overview');
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

    it('redirects voice conversation UUID without voiceOpsTab to operational inbox', () => {
      const resolved = resolveLegacyCommunicationRoute(
        `?view=ai-voice-assistant&conversationId=${CANONICAL_CONVERSATION_ID}`,
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'inbox',
        channel: 'voice',
        selectedConversationId: CANONICAL_CONVERSATION_ID,
        mobilePane: 'conversation',
      });
    });

    it('keeps analytics when conversationId present with explicit analytics tab', () => {
      const resolved = resolveLegacyCommunicationRoute(
        `?view=ai-voice-assistant&voiceOpsTab=analytics&conversationId=${CANONICAL_CONVERSATION_ID}`,
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        primaryTab: 'channels',
        voiceIntent: 'analytics',
      });
      expect(resolved?.communicationCenterState?.selectedConversationId).toBeUndefined();
    });

    it('redirects onboarding wizard tests to canonical wizard metadata', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceWizardStep=tests',
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        voiceIntent: 'test',
        voiceWizardStep: 'tests',
      });
    });

    it('redirects configured assistant test center without wizard metadata', () => {
      const resolved = resolveLegacyCommunicationRoute(
        '?view=ai-voice-assistant&voiceOpsTab=settings&voiceSettingsSection=test',
      );
      expect(resolved?.communicationCenterState).toMatchObject({
        voiceIntent: 'test',
        voiceWizardStep: null,
      });
    });

    it('maps wizard vs configured test intents for embedded VoiceAssistantView', () => {
      expect(
        mapVoiceIntentToAssistantState('test', { wizardStep: 'tests' }),
      ).toEqual({ opsTab: 'settings', wizardStep: 'tests', settingsSection: null });
      expect(mapVoiceIntentToAssistantState('test')).toEqual({
        opsTab: 'settings',
        settingsSection: 'test',
      });
    });

    it('maps embedded voice tab changes back to canonical voice intent', () => {
      expect(
        mapVoiceAssistantStateToCanonicalVoiceIntent({
          opsTab: 'settings',
          settingsSection: 'telephony',
        }),
      ).toEqual({ voiceIntent: 'telephony', voiceWizardStep: null });
    });
  });

  it('returns null for non-legacy views', () => {
    expect(resolveLegacyCommunicationRoute('?view=communication-center')).toBeNull();
    expect(resolveLegacyCommunicationRoute('?view=dashboard')).toBeNull();
  });

  it('ignores sensitive params during resolve (allowlist at parse)', () => {
    const resolved = resolveLegacyCommunicationRoute(
      '?view=whatsapp-business&tab=inbox&token=secret&phone=%2B491&debug=x',
    );
    expect(resolved?.communicationCenterState?.primaryTab).toBe('inbox');
  });

  it('builds canonical CC state for voice intents from communication callbacks', () => {
    expect(
      buildCommunicationCenterStateForVoiceIntent({ opsTab: 'analytics' }),
    ).toMatchObject({
      primaryTab: 'channels',
      channelsSection: 'voice',
      voiceIntent: 'analytics',
    });
  });

  describe('runtime redirect URL sanitization', () => {
    let replaceState: ReturnType<typeof vi.fn>;
    let pushState: ReturnType<typeof vi.fn>;
    let href: { value: string };
    let search: { value: string };
    let hash: { value: string };

    beforeEach(() => {
      replaceState = vi.fn((_state: unknown, _title: string, nextUrl: string) => {
        href.value = nextUrl.startsWith('http')
          ? nextUrl
          : `http://localhost${nextUrl.startsWith('/') ? '' : '/'}${nextUrl}`;
        const queryIndex = href.value.indexOf('?');
        const hashIndex = href.value.indexOf('#');
        search.value = queryIndex >= 0 ? href.value.slice(queryIndex, hashIndex >= 0 ? hashIndex : undefined) : '';
        hash.value = hashIndex >= 0 ? href.value.slice(hashIndex) : '';
      });
      pushState = vi.fn();
      href = { value: 'http://localhost/rental' };
      search = { value: '' };
      hash = { value: '' };
      vi.stubGlobal('window', {
        location: {
          get href() {
            return href.value;
          },
          get search() {
            return search.value;
          },
          get hash() {
            return hash.value;
          },
          pathname: '/rental',
        },
        history: {
          replaceState,
          pushState,
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('strips sensitive and legacy params from final WhatsApp redirect URL', () => {
      const legacySearch =
        '?view=whatsapp-business&tab=inbox&token=secret123&phone=%2B491234&debug=providerPayload&filter=unread&search=brake&settingsTab=company';
      window.history.replaceState({}, '', `/rental${legacySearch}`);
      redirectLegacyCommunicationRoute(legacySearch, { replace: true });
      const finalParams = parseFinalUrl(String(replaceState.mock.calls.at(-1)?.[2] ?? ''));
      expect(finalParams.get('view')).toBe('communication-center');
      expect(finalParams.get(COMMUNICATION_CHANNEL_PARAM)).toBe('whatsapp');
      expect(finalParams.get(COMMUNICATION_UNREAD_PARAM)).toBe('true');
      expect(finalParams.get(COMMUNICATION_SEARCH_PARAM)).toBe('brake');
      expect(finalParams.get('token')).toBeNull();
      expect(finalParams.get('phone')).toBeNull();
      expect(finalParams.get('debug')).toBeNull();
      expect(finalParams.get('tab')).toBeNull();
      expect(finalParams.get('filter')).toBeNull();
      expect(finalParams.get('search')).toBeNull();
      expect(finalParams.get('whatsapp-business')).toBeNull();
      expect(finalParams.get('settingsTab')).toBeNull();
      const finalUrl = String(replaceState.mock.calls.at(-1)?.[2] ?? '');
      expect(finalUrl).not.toContain('#');
      for (const key of LEGACY_COMMUNICATION_QUERY_PARAM_KEYS) {
        expect(finalParams.get(key)).toBeNull();
      }
    });

    it('strips sensitive and legacy params from final Voice redirect URL', () => {
      window.history.replaceState(
        {},
        '',
        '/rental?view=ai-voice-assistant&voiceOpsTab=analytics&providerToken=secret&phone=%2B49123&voiceSettingsSection=builder',
      );
      redirectLegacyCommunicationRoute(window.location.search, { replace: true });
      const finalParams = parseFinalUrl(String(replaceState.mock.calls.at(-1)?.[2] ?? ''));
      expect(finalParams.get('view')).toBe('communication-center');
      expect(finalParams.get(COMMUNICATION_TAB_PARAM)).toBe('channels');
      expect(finalParams.get(COMMUNICATION_CHANNELS_PARAM)).toBe('voice');
      expect(finalParams.get(COMMUNICATION_VOICE_INTENT_PARAM)).toBe('analytics');
      expect(finalParams.get('providerToken')).toBeNull();
      expect(finalParams.get('phone')).toBeNull();
      expect(finalParams.get(VOICE_OPS_TAB_PARAM)).toBeNull();
      expect(finalParams.get(VOICE_SETTINGS_SECTION_PARAM)).toBeNull();
      expect(finalParams.get('ai-voice-assistant')).toBeNull();
    });

    it('uses replaceState only for automatic legacy redirects', () => {
      window.history.replaceState({}, '', '/rental?view=whatsapp-business&tab=templates');
      redirectLegacyCommunicationRoute(window.location.search, { replace: true });
      expect(replaceState).toHaveBeenCalled();
      expect(pushState).not.toHaveBeenCalled();
    });

    it('does not leave legacy view param after redirect', () => {
      window.history.replaceState({}, '', '/rental?view=whatsapp-business&tab=inbox');
      redirectLegacyCommunicationRoute(window.location.search, { replace: true });
      const nextUrl = String(replaceState.mock.calls.at(-1)?.[2] ?? '');
      expect(nextUrl).not.toContain('whatsapp-business');
      expect(nextUrl).toContain(`${COMMUNICATION_CHANNEL_PARAM}=whatsapp`);
    });

    it('writes voice wizard step into canonical URL when onboarding tests intent', () => {
      window.history.replaceState({}, '', '/rental?view=ai-voice-assistant&voiceWizardStep=tests');
      applyResolvedLegacyCommunicationRoute(
        resolveLegacyCommunicationRoute(window.location.search)!,
        { replace: true },
      );
      const finalParams = parseFinalUrl(String(replaceState.mock.calls.at(-1)?.[2] ?? ''));
      expect(finalParams.get(COMMUNICATION_VOICE_INTENT_PARAM)).toBe('test');
      expect(finalParams.get(COMMUNICATION_VOICE_WIZARD_STEP_PARAM)).toBe('tests');
    });
  });
});
