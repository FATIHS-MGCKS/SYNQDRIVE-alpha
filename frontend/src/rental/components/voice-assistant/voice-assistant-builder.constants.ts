import type { VoiceAssistantUpdatePayload } from '../../../lib/api';

/** Writable text fields used in the configuration builder. */
export type BuilderTextField =
  | 'name'
  | 'role'
  | 'personality'
  | 'language'
  | 'voiceId'
  | 'voiceName'
  | 'greetingMessage'
  | 'systemPrompt'
  | 'companyContext'
  | 'businessRules'
  | 'forbiddenActions'
  | 'knowledgeSnippets';

export type VoiceTextField = Exclude<{
  [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends string | undefined ? K : never;
}[keyof VoiceAssistantUpdatePayload], undefined>;

/** Mirrors backend `UpdateVoiceAssistantDto` @MaxLength values. */
export const VOICE_FIELD_LIMITS: Record<BuilderTextField, number> = {
  name: 120,
  role: 120,
  personality: 2000,
  language: 16,
  voiceId: 120,
  voiceName: 120,
  greetingMessage: 2000,
  systemPrompt: 32000,
  companyContext: 32000,
  businessRules: 16000,
  forbiddenActions: 8000,
  knowledgeSnippets: 32000,
};

export const LANGUAGE_OPTIONS = [
  { value: 'de', label: 'German' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'tr', label: 'Turkish' },
] as const;

export interface RecommendedForbiddenRule {
  id: string;
  label: string;
  description: string;
  line: string;
}

export const RECOMMENDED_FORBIDDEN_RULES: RecommendedForbiddenRule[] = [
  {
    id: 'no_price_quotes',
    label: 'No binding price quotes',
    description: 'Do not quote final prices without live tariff data.',
    line: 'Never make binding price commitments without verified tariff data from the pricing system.',
  },
  {
    id: 'no_cancel_without_human',
    label: 'No cancellations without human approval',
    description: 'Cancellations and refunds require staff confirmation.',
    line: 'Never confirm booking cancellations or refunds without human staff approval.',
  },
  {
    id: 'no_sensitive_data',
    label: 'No sensitive customer data',
    description: 'Do not read out passwords, payment details, or ID numbers.',
    line: 'Never disclose sensitive customer data (payment details, passwords, full ID numbers).',
  },
  {
    id: 'no_legal_medical',
    label: 'No legal or medical advice',
    description: 'Decline liability, insurance, or health questions.',
    line: 'Never provide legal, insurance, or medical advice — escalate to a human agent.',
  },
  {
    id: 'escalate_emergency',
    label: 'Escalate accidents and breakdowns',
    description: 'Roadside emergencies must transfer immediately.',
    line: 'Always escalate accidents, breakdowns, and roadside emergencies to a human agent immediately.',
  },
];
