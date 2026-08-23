import { describe, expect, it } from 'vitest';

import {
  buildVoiceAssistantUrl,
  mergeVoiceAssistantState,
  normalizeVoiceOpsTab,
  normalizeVoiceSettingsSection,
  readVoiceAssistantStateFromUrl,
  resolveVoiceTestNavigationIntent,
} from './voice-assistant-navigation';

describe('voice-assistant-navigation', () => {
  it('normalizes invalid ops tab to overview', () => {
    expect(normalizeVoiceOpsTab('analytics')).toBe('analytics');
    expect(normalizeVoiceOpsTab('invalid')).toBe('overview');
  });

  it('normalizes invalid settings section to null', () => {
    expect(normalizeVoiceSettingsSection('test')).toBe('test');
    expect(normalizeVoiceSettingsSection('invalid')).toBeNull();
  });

  it('parses voice ops tab, wizard step, and settings section from URL', () => {
    expect(
      readVoiceAssistantStateFromUrl(
        '?view=ai-voice-assistant&voiceOpsTab=analytics&voiceWizardStep=tests&voiceSettingsSection=test',
      ),
    ).toEqual({
      opsTab: 'analytics',
      wizardStep: 'tests',
      settingsSection: 'test',
    });
  });

  it('builds voice assistant deep link URL', () => {
    expect(buildVoiceAssistantUrl({ opsTab: 'settings' })).toContain('voiceOpsTab=settings');
    expect(buildVoiceAssistantUrl({ opsTab: 'settings', settingsSection: 'test' })).toContain(
      'voiceSettingsSection=test',
    );
    expect(buildVoiceAssistantUrl({ opsTab: 'overview' })).not.toContain('voiceOpsTab=');
  });

  it('merges voice assistant state with defaults', () => {
    expect(mergeVoiceAssistantState({ opsTab: 'automations' })).toEqual({
      opsTab: 'automations',
      wizardStep: null,
      settingsSection: null,
    });
  });

  it('routes configured assistants to settings test section', () => {
    expect(
      resolveVoiceTestNavigationIntent(
        { opsTab: 'settings', settingsSection: 'test' },
        false,
      ),
    ).toEqual({
      opsTab: 'settings',
      settingsSection: 'test',
      wizardStep: null,
    });
  });

  it('routes onboarding assistants to wizard tests step', () => {
    expect(
      resolveVoiceTestNavigationIntent(
        { opsTab: 'settings', settingsSection: 'test' },
        true,
      ),
    ).toEqual({
      opsTab: 'settings',
      settingsSection: null,
      wizardStep: 'tests',
    });
  });

  it('migrates legacy wizard test deep link for configured assistants', () => {
    expect(
      resolveVoiceTestNavigationIntent({ wizardStep: 'tests' }, false),
    ).toEqual({
      opsTab: 'settings',
      settingsSection: 'test',
      wizardStep: null,
    });
  });
});
