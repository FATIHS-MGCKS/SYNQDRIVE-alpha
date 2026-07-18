export type VoiceAutomationUseCaseId =
  | 'pickup_confirmation'
  | 'return_reminder'
  | 'overdue_return'
  | 'no_show'
  | 'missing_document'
  | 'open_payment'
  | 'callback'
  | 'damage_followup';

export interface VoiceAutomationCatalogEntry {
  id: VoiceAutomationUseCaseId;
  triggerEvent: string;
  category: 'support' | 'finance';
  audienceKey: string;
  defaultCooldownHours: number;
  defaultMaxCallsPerRun: number;
  defaultAllowedCountries: string[];
  defaultAllowedActions: string[];
  requiresConfirmation: boolean;
}

export const VOICE_AUTOMATION_CATALOG: VoiceAutomationCatalogEntry[] = [
  {
    id: 'pickup_confirmation',
    triggerEvent: 'manual.test',
    category: 'support',
    audienceKey: 'voice.automation.audience.pickup_today',
    defaultCooldownHours: 24,
    defaultMaxCallsPerRun: 25,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['booking_lookup', 'customer_lookup'],
    requiresConfirmation: true,
  },
  {
    id: 'return_reminder',
    triggerEvent: 'booking.completed',
    category: 'support',
    audienceKey: 'voice.automation.audience.return_due',
    defaultCooldownHours: 12,
    defaultMaxCallsPerRun: 25,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['booking_lookup'],
    requiresConfirmation: true,
  },
  {
    id: 'overdue_return',
    triggerEvent: 'booking.returned',
    category: 'support',
    audienceKey: 'voice.automation.audience.overdue_return',
    defaultCooldownHours: 6,
    defaultMaxCallsPerRun: 15,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['booking_lookup', 'escalation'],
    requiresConfirmation: true,
  },
  {
    id: 'no_show',
    triggerEvent: 'manual.test',
    category: 'support',
    audienceKey: 'voice.automation.audience.no_show',
    defaultCooldownHours: 48,
    defaultMaxCallsPerRun: 10,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['booking_lookup', 'task_create'],
    requiresConfirmation: true,
  },
  {
    id: 'missing_document',
    triggerEvent: 'manual.test',
    category: 'support',
    audienceKey: 'voice.automation.audience.missing_document',
    defaultCooldownHours: 24,
    defaultMaxCallsPerRun: 20,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['document_status', 'booking_lookup'],
    requiresConfirmation: true,
  },
  {
    id: 'open_payment',
    triggerEvent: 'invoice.overdue',
    category: 'finance',
    audienceKey: 'voice.automation.audience.open_payment',
    defaultCooldownHours: 72,
    defaultMaxCallsPerRun: 15,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['invoice_status', 'payment_link'],
    requiresConfirmation: true,
  },
  {
    id: 'callback',
    triggerEvent: 'customer.complaint.created',
    category: 'support',
    audienceKey: 'voice.automation.audience.callback',
    defaultCooldownHours: 4,
    defaultMaxCallsPerRun: 5,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['customer_lookup', 'task_create'],
    requiresConfirmation: true,
  },
  {
    id: 'damage_followup',
    triggerEvent: 'customer.complaint.created',
    category: 'support',
    audienceKey: 'voice.automation.audience.damage_followup',
    defaultCooldownHours: 24,
    defaultMaxCallsPerRun: 10,
    defaultAllowedCountries: ['DE'],
    defaultAllowedActions: ['damage_status', 'booking_lookup'],
    requiresConfirmation: true,
  },
];

export const VOICE_AUTOMATION_SCOPE_MARKER = 'voiceAutomation';
