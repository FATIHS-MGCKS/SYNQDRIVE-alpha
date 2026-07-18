import type { VoiceOption, VoicePlanCatalogEntry } from '../../../lib/api';

/** Minimum interval between voice sample previews (client-side rate limit). */
export const VOICE_PREVIEW_MIN_INTERVAL_MS = 3000;

const LANGUAGE_BLOCK_RE = /\[languages\]\s*primary=([^,\]\s]+)(?:,\s*secondary=([^\]\s]+))?/i;
const PRONUNCIATION_BLOCK_RE = /\[pronunciation\]\s*([\s\S]*?)(?=\n\[|$)/i;

export interface AssistantOnboardingFields {
  name: string;
  companyName: string;
  language: string;
  secondaryLanguage: string;
  voiceId: string;
  voiceName: string;
  personality: string;
  greetingMessage: string;
  pronunciationHints: string;
  companyContextBody: string;
}

export type AssistantOnboardingFieldKey = keyof AssistantOnboardingFields;

export function canPlayVoicePreview(lastPlayedAt: number | null, now = Date.now()): boolean {
  if (lastPlayedAt == null) return true;
  return now - lastPlayedAt >= VOICE_PREVIEW_MIN_INTERVAL_MS;
}

export function stripWizardMetadataBlocks(text: string): string {
  return text
    .replace(LANGUAGE_BLOCK_RE, '')
    .replace(PRONUNCIATION_BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseAssistantOnboardingFromAssistant(input: {
  name: string;
  role: string | null;
  language: string;
  voiceId: string | null;
  voiceName: string | null;
  personality: string | null;
  greetingMessage: string | null;
  companyContext: string | null;
}): AssistantOnboardingFields {
  const context = input.companyContext ?? '';
  const langMatch = context.match(LANGUAGE_BLOCK_RE);
  const pronMatch = context.match(PRONUNCIATION_BLOCK_RE);

  return {
    name: input.name ?? '',
    companyName: input.role?.trim() ?? '',
    language: langMatch?.[1] ?? input.language ?? 'de',
    secondaryLanguage: langMatch?.[2] ?? '',
    voiceId: input.voiceId ?? '',
    voiceName: input.voiceName ?? '',
    personality: input.personality ?? '',
    greetingMessage: input.greetingMessage ?? '',
    pronunciationHints: pronMatch?.[1]?.trim() ?? '',
    companyContextBody: stripWizardMetadataBlocks(context),
  };
}

export function buildCompanyContextForSave(fields: AssistantOnboardingFields): string {
  const body = stripWizardMetadataBlocks(fields.companyContextBody);
  const langBlock = `[languages] primary=${fields.language}${
    fields.secondaryLanguage ? `, secondary=${fields.secondaryLanguage}` : ''
  }`;
  const pronBlock = fields.pronunciationHints.trim()
    ? `[pronunciation] ${fields.pronunciationHints.trim()}`
    : '';
  return [body, langBlock, pronBlock].filter(Boolean).join('\n\n').trim();
}

export function assistantOnboardingToPayload(fields: AssistantOnboardingFields) {
  return {
    name: fields.name.trim(),
    role: fields.companyName.trim(),
    language: fields.language,
    voiceId: fields.voiceId,
    voiceName: fields.voiceName || undefined,
    personality: fields.personality.trim() || undefined,
    greetingMessage: fields.greetingMessage.trim(),
    companyContext: buildCompanyContextForSave(fields) || undefined,
  };
}

export function validateAssistantOnboarding(
  fields: AssistantOnboardingFields,
  plan: VoicePlanCatalogEntry | null,
): { valid: boolean; errors: Partial<Record<AssistantOnboardingFieldKey, string>> } {
  const errors: Partial<Record<AssistantOnboardingFieldKey, string>> = {};

  if (!fields.name.trim()) errors.name = 'required';
  if (!fields.companyName.trim()) errors.companyName = 'required';
  if (!fields.language.trim()) errors.language = 'required';
  if (!fields.voiceId.trim()) errors.voiceId = 'required';
  if (!fields.greetingMessage.trim()) errors.greetingMessage = 'required';

  if (fields.secondaryLanguage && fields.secondaryLanguage === fields.language) {
    errors.secondaryLanguage = 'duplicate';
  }

  if (
    fields.secondaryLanguage &&
    plan &&
    !plan.entitlements.supportedLanguages.includes(fields.secondaryLanguage)
  ) {
    errors.secondaryLanguage = 'notAllowed';
  }

  if (fields.language && plan && !plan.entitlements.supportedLanguages.includes(fields.language)) {
    errors.language = 'notAllowed';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function resolveVoiceLanguage(voice: VoiceOption): string {
  const labelLang = voice.labels?.language?.toLowerCase();
  if (labelLang) return labelLang;
  const accent = voice.labels?.accent?.toLowerCase();
  if (accent) return accent;
  return 'other';
}

export function groupVoicesByLanguage(voices: VoiceOption[]): Map<string, VoiceOption[]> {
  const groups = new Map<string, VoiceOption[]>();
  for (const voice of voices) {
    const lang = resolveVoiceLanguage(voice);
    const bucket = groups.get(lang) ?? [];
    bucket.push(voice);
    groups.set(lang, bucket);
  }
  return groups;
}

export function buildGreetingPreview(greeting: string, assistantName: string, companyName: string): string {
  const template = greeting.trim();
  if (!template) return '';
  return template
    .replace(/\{assistant\}/gi, assistantName.trim() || '…')
    .replace(/\{company\}/gi, companyName.trim() || '…');
}
