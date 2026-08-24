import {
  COMMUNICATION_CENTER_VIEW,
  COMMUNICATION_CHANNELS_PARAM,
  COMMUNICATION_TAB_PARAM,
  COMMUNICATION_VOICE_INTENT_PARAM,
  mergeCommunicationCenterState,
} from '../components/communication-center/communication-center-navigation';
import { buildCommunicationCenterStateForVoiceIntent } from '../components/communication-center/legacy-communication-navigation';
import type { VoiceAssistantUrlState } from '../components/voice-assistant/voice-assistant-navigation';

export const RENTAL_VIEW_PARAM = 'view';
export const RENTAL_SETTINGS_TAB_PARAM = 'settingsTab';

const WORKFLOW_AUTOMATION_VIEW = 'workflow-automation';
const RENTAL_SETTINGS_VIEW_ID = 'settings';

export type RentalSettingsTabId =
  | 'account'
  | 'company'
  | 'users'
  | 'billing'
  | 'data-authorization'
  | 'legal-documents'
  | 'email-versand'
  | 'rental-rules';

export function buildRentalViewSearchParams(
  view: string,
  options?: {
    settingsTab?: RentalSettingsTabId;
    voice?: Partial<VoiceAssistantUrlState>;
  },
): URLSearchParams {
  const params = new URLSearchParams();
  params.set(RENTAL_VIEW_PARAM, view);

  if (options?.settingsTab) {
    params.set(RENTAL_SETTINGS_TAB_PARAM, options.settingsTab);
  }

  if (options?.voice) {
    const wizardStep =
      options.voice.wizardStep === 'tests' ? 'tests' : null;
    const ccState = mergeCommunicationCenterState(
      buildCommunicationCenterStateForVoiceIntent({
        opsTab: options.voice.opsTab ?? 'overview',
        settingsSection: options.voice.settingsSection ?? null,
        wizardStep,
      }),
    );
    params.set(RENTAL_VIEW_PARAM, COMMUNICATION_CENTER_VIEW);
    if (ccState.primaryTab !== 'inbox') {
      params.set(COMMUNICATION_TAB_PARAM, ccState.primaryTab);
    }
    if (ccState.primaryTab === 'channels' && ccState.channelsSection !== 'overview') {
      params.set(COMMUNICATION_CHANNELS_PARAM, ccState.channelsSection);
    }
    if (ccState.voiceIntent) {
      params.set(COMMUNICATION_VOICE_INTENT_PARAM, ccState.voiceIntent);
    }
  }

  return params;
}

export function buildRentalViewUrl(
  view: string,
  options?: {
    settingsTab?: RentalSettingsTabId;
    voice?: Partial<VoiceAssistantUrlState>;
  },
  pathname = '/rental',
): string {
  const params = buildRentalViewSearchParams(view, options);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function readRentalSettingsTabFromUrl(search = ''): RentalSettingsTabId | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tab = params.get(RENTAL_SETTINGS_TAB_PARAM);
  if (
    tab === 'account' ||
    tab === 'company' ||
    tab === 'users' ||
    tab === 'billing' ||
    tab === 'data-authorization' ||
    tab === 'legal-documents' ||
    tab === 'email-versand' ||
    tab === 'rental-rules'
  ) {
    return tab;
  }
  return null;
}

export { COMMUNICATION_CENTER_VIEW, WORKFLOW_AUTOMATION_VIEW };
export const RENTAL_SETTINGS_VIEW = RENTAL_SETTINGS_VIEW_ID;
