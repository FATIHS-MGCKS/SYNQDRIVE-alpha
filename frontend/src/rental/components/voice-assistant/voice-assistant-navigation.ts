import {
  WIZARD_STEPS,
  type VoiceOpsTab,
  type VoiceWizardStep,
} from './voice-wizard.ops';

export const VOICE_ASSISTANT_VIEW = 'ai-voice-assistant';
export const VOICE_OPS_TAB_PARAM = 'voiceOpsTab';
export const VOICE_WIZARD_STEP_PARAM = 'voiceWizardStep';

const OPS_TABS = new Set<string>([
  'overview',
  'conversations',
  'automations',
  'analytics',
  'settings',
]);

export interface VoiceAssistantUrlState {
  opsTab: VoiceOpsTab;
  wizardStep: VoiceWizardStep | null;
}

export const DEFAULT_VOICE_ASSISTANT_URL_STATE: VoiceAssistantUrlState = {
  opsTab: 'overview',
  wizardStep: null,
};

function parseSearch(search = ''): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function normalizeVoiceOpsTab(
  tab: VoiceOpsTab | string | null | undefined,
): VoiceOpsTab {
  if (tab && OPS_TABS.has(tab)) {
    return tab as VoiceOpsTab;
  }
  return 'overview';
}

export function normalizeVoiceWizardStep(
  step: VoiceWizardStep | string | null | undefined,
): VoiceWizardStep | null {
  if (step && (WIZARD_STEPS as readonly string[]).includes(step)) {
    return step as VoiceWizardStep;
  }
  return null;
}

export function readVoiceAssistantStateFromUrl(
  search = '',
): Partial<VoiceAssistantUrlState> {
  const params = parseSearch(search);
  const next: Partial<VoiceAssistantUrlState> = {};

  const opsTab = params.get(VOICE_OPS_TAB_PARAM);
  if (opsTab) {
    next.opsTab = normalizeVoiceOpsTab(opsTab);
  }

  const wizardStep = params.get(VOICE_WIZARD_STEP_PARAM);
  if (wizardStep) {
    next.wizardStep = normalizeVoiceWizardStep(wizardStep);
  }

  return next;
}

export function mergeVoiceAssistantState(
  partial: Partial<VoiceAssistantUrlState> | undefined,
): VoiceAssistantUrlState {
  return {
    ...DEFAULT_VOICE_ASSISTANT_URL_STATE,
    ...partial,
    opsTab: normalizeVoiceOpsTab(partial?.opsTab),
    wizardStep: normalizeVoiceWizardStep(partial?.wizardStep),
  };
}

export function syncVoiceAssistantStateToUrl(
  state: VoiceAssistantUrlState,
  options?: { replace?: boolean },
): void {
  if (typeof window === 'undefined') return;

  const normalized = mergeVoiceAssistantState(state);
  const url = new URL(window.location.href);
  url.searchParams.set('view', VOICE_ASSISTANT_VIEW);

  const entries: Array<[string, string | null]> = [
    [VOICE_OPS_TAB_PARAM, normalized.opsTab === 'overview' ? null : normalized.opsTab],
    [VOICE_WIZARD_STEP_PARAM, normalized.wizardStep],
  ];

  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  if (options?.replace) {
    window.history.replaceState({}, '', next);
  } else {
    window.history.pushState({}, '', next);
  }
}

export function buildVoiceAssistantSearchParams(options: {
  opsTab?: VoiceOpsTab;
  wizardStep?: VoiceWizardStep | null;
} = {}): URLSearchParams {
  const state = mergeVoiceAssistantState(options);
  const params = new URLSearchParams();
  params.set('view', VOICE_ASSISTANT_VIEW);
  if (state.opsTab !== 'overview') {
    params.set(VOICE_OPS_TAB_PARAM, state.opsTab);
  }
  if (state.wizardStep) {
    params.set(VOICE_WIZARD_STEP_PARAM, state.wizardStep);
  }
  return params;
}

export function buildVoiceAssistantUrl(
  options: {
    opsTab?: VoiceOpsTab;
    wizardStep?: VoiceWizardStep | null;
  } = {},
  pathname = '/rental',
): string {
  const params = buildVoiceAssistantSearchParams(options);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
