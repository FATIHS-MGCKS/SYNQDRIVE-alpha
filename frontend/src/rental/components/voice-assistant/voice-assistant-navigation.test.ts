import { describe, expect, it } from 'vitest';

import {
  buildVoiceAssistantUrl,
  mergeVoiceAssistantState,
  normalizeVoiceOpsTab,
  readVoiceAssistantStateFromUrl,
} from './voice-assistant-navigation';

describe('voice-assistant-navigation', () => {
  it('normalizes invalid ops tab to overview', () => {
    expect(normalizeVoiceOpsTab('analytics')).toBe('analytics');
    expect(normalizeVoiceOpsTab('invalid')).toBe('overview');
  });

  it('parses voice ops tab and wizard step from URL', () => {
    expect(
      readVoiceAssistantStateFromUrl('?view=ai-voice-assistant&voiceOpsTab=analytics&voiceWizardStep=tests'),
    ).toEqual({
      opsTab: 'analytics',
      wizardStep: 'tests',
    });
  });

  it('builds voice assistant deep link URL', () => {
    expect(buildVoiceAssistantUrl({ opsTab: 'settings' })).toContain('voiceOpsTab=settings');
    expect(buildVoiceAssistantUrl({ opsTab: 'overview' })).not.toContain('voiceOpsTab=');
  });

  it('merges voice assistant state with defaults', () => {
    expect(mergeVoiceAssistantState({ opsTab: 'automations' })).toEqual({
      opsTab: 'automations',
      wizardStep: null,
    });
  });
});
