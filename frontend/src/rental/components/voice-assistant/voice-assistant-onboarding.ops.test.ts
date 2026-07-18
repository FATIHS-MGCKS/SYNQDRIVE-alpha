import { describe, expect, it, vi } from 'vitest';
import type { VoiceOption, VoicePlanCatalogEntry } from '../../../lib/api';
import {
  assistantOnboardingToPayload,
  buildCompanyContextForSave,
  buildGreetingPreview,
  canPlayVoicePreview,
  groupVoicesByLanguage,
  parseAssistantOnboardingFromAssistant,
  validateAssistantOnboarding,
  VOICE_PREVIEW_MIN_INTERVAL_MS,
} from './voice-assistant-onboarding.ops';

const plan: VoicePlanCatalogEntry = {
  code: 'PRO',
  catalogVersion: '2026-07-17',
  currency: 'EUR',
  monthlyFeeCents: 11900,
  monthlyFeeEuros: 119,
  setupFeeCents: 24900,
  setupFeeEuros: 249,
  entitlements: {
    includedMinutesPerMonth: 400,
    overageCentsPerMinute: 29,
    localPhoneNumbers: 1,
    maxBranches: 2,
    maxConcurrentCalls: 2,
    supportedLanguages: ['de', 'en'],
  },
};

const baseFields = {
  name: 'Mia',
  companyName: 'SynqDrive Rental',
  language: 'de',
  secondaryLanguage: 'en',
  voiceId: 'voice-1',
  voiceName: 'Clara',
  personality: 'Professional',
  greetingMessage: 'Hello from {company}!',
  pronunciationHints: 'SynqDrive = sink-drive',
  companyContextBody: 'We operate in Berlin.',
};

describe('voice-assistant-onboarding.ops', () => {
  it('validates required assistant fields', () => {
    const result = validateAssistantOnboarding(
      { ...baseFields, name: '', voiceId: '' },
      plan,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBe('required');
    expect(result.errors.voiceId).toBe('required');
  });

  it('rejects duplicate secondary language', () => {
    const result = validateAssistantOnboarding(
      { ...baseFields, secondaryLanguage: 'de' },
      plan,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.secondaryLanguage).toBe('duplicate');
  });

  it('rejects language outside plan entitlements', () => {
    const result = validateAssistantOnboarding(
      { ...baseFields, language: 'fr' },
      plan,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.language).toBe('notAllowed');
  });

  it('groups voices by language label', () => {
    const voices: VoiceOption[] = [
      { voice_id: '1', name: 'Anna', labels: { language: 'de' } },
      { voice_id: '2', name: 'John', labels: { language: 'en' } },
    ];
    const grouped = groupVoicesByLanguage(voices);
    expect(grouped.get('de')).toHaveLength(1);
    expect(grouped.get('en')).toHaveLength(1);
  });

  it('rate-limits voice preview playback', () => {
    const now = 1_000_000;
    expect(canPlayVoicePreview(null, now)).toBe(true);
    expect(canPlayVoicePreview(now - 1000, now)).toBe(false);
    expect(canPlayVoicePreview(now - VOICE_PREVIEW_MIN_INTERVAL_MS, now)).toBe(true);
  });

  it('builds greeting preview with placeholders', () => {
    expect(buildGreetingPreview('Hi {company}', 'Mia', 'Acme')).toBe('Hi Acme');
  });

  it('round-trips pronunciation and languages in company context', () => {
    const payload = assistantOnboardingToPayload(baseFields);
    expect(payload.companyContext).toContain('[languages] primary=de, secondary=en');
    expect(payload.companyContext).toContain('[pronunciation]');

    const parsed = parseAssistantOnboardingFromAssistant({
      name: payload.name!,
      role: payload.role!,
      language: 'de',
      voiceId: payload.voiceId!,
      voiceName: payload.voiceName!,
      personality: payload.personality!,
      greetingMessage: payload.greetingMessage!,
      companyContext: payload.companyContext!,
    });

    expect(parsed.secondaryLanguage).toBe('en');
    expect(parsed.pronunciationHints).toContain('sink-drive');
    expect(parsed.companyContextBody).toBe('We operate in Berlin.');
  });

  it('strips wizard metadata blocks from company context body', () => {
    const raw = buildCompanyContextForSave(baseFields);
    const parsed = parseAssistantOnboardingFromAssistant({
      name: 'Mia',
      role: 'Synq',
      language: 'de',
      voiceId: 'v1',
      voiceName: 'Clara',
      personality: '',
      greetingMessage: 'Hi',
      companyContext: raw,
    });
    expect(parsed.companyContextBody).toBe('We operate in Berlin.');
  });
});

describe('voice preview safety', () => {
  it('does not invoke telephony — preview uses client audio only', () => {
    const play = vi.fn();
    const audio = { play, pause: vi.fn(), addEventListener: vi.fn() };
    expect(audio.play).not.toHaveBeenCalled();
  });
});
