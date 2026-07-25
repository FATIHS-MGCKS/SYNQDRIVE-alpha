export type WorkflowSmsLocale = 'de' | 'en';

export type WorkflowSmsTemplateKey =
  | 'booking_follow_up'
  | 'pickup_reminder'
  | 'workflow_operational';

export interface WorkflowSmsTemplateDefinition {
  key: WorkflowSmsTemplateKey;
  version: string;
  category: 'TRANSACTIONAL' | 'MARKETING';
  enforceQuietHours: boolean;
  locales: Record<WorkflowSmsLocale, (params: Record<string, string>) => string>;
}

export const WORKFLOW_SMS_TEMPLATES: Record<WorkflowSmsTemplateKey, WorkflowSmsTemplateDefinition> = {
  booking_follow_up: {
    key: 'booking_follow_up',
    version: '1.0.0',
    category: 'TRANSACTIONAL',
    enforceQuietHours: true,
    locales: {
      de: (p) =>
        `Hallo${p.name ? ` ${p.name}` : ''}! Kurzes Update zu deiner Buchung${p.bookingRef ? ` ${p.bookingRef}` : ''}. ${p.message ?? ''}`.trim(),
      en: (p) =>
        `Hi${p.name ? ` ${p.name}` : ''}! Quick update on your booking${p.bookingRef ? ` ${p.bookingRef}` : ''}. ${p.message ?? ''}`.trim(),
    },
  },
  pickup_reminder: {
    key: 'pickup_reminder',
    version: '1.0.0',
    category: 'TRANSACTIONAL',
    enforceQuietHours: true,
    locales: {
      de: (p) =>
        `Erinnerung: Abholung${p.pickupDate ? ` am ${p.pickupDate}` : ''}${p.station ? ` — ${p.station}` : ''}. ${p.message ?? ''}`.trim(),
      en: (p) =>
        `Reminder: pickup${p.pickupDate ? ` on ${p.pickupDate}` : ''}${p.station ? ` at ${p.station}` : ''}. ${p.message ?? ''}`.trim(),
    },
  },
  workflow_operational: {
    key: 'workflow_operational',
    version: '1.0.0',
    category: 'TRANSACTIONAL',
    enforceQuietHours: true,
    locales: {
      de: (p) => p.message?.trim() || 'Wichtige Mitteilung von SynqDrive.',
      en: (p) => p.message?.trim() || 'Important message from SynqDrive.',
    },
  },
};

export function renderWorkflowSmsTemplate(
  template: WorkflowSmsTemplateDefinition,
  locale: WorkflowSmsLocale,
  params: Record<string, string>,
): string {
  const render = template.locales[locale] ?? template.locales.de;
  return render(params);
}
