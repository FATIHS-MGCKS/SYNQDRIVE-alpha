import type { WorkflowEmailLocale, WorkflowEmailTemplateKey } from './workflow-action-adapter.types';

export type WorkflowEmailTemplateCategory = 'TRANSACTIONAL' | 'MARKETING';

export interface WorkflowEmailTemplateDefinition {
  templateId: WorkflowEmailTemplateKey;
  version: string;
  category: WorkflowEmailTemplateCategory;
  /** When true, sends outside org send window are blocked unless `respectSendWindow: false`. */
  enforceSendWindow: boolean;
  subjects: Record<WorkflowEmailLocale, string>;
  bodyText: Record<WorkflowEmailLocale, string>;
  bodyHtml: Record<WorkflowEmailLocale, string>;
}

export const WORKFLOW_EMAIL_TEMPLATES: Record<
  WorkflowEmailTemplateKey,
  WorkflowEmailTemplateDefinition
> = {
  booking_follow_up: {
    templateId: 'booking_follow_up',
    version: '1.0.0',
    category: 'TRANSACTIONAL',
    enforceSendWindow: true,
    subjects: {
      de: 'Ihre Buchung bei {{orgName}}',
      en: 'Your booking with {{orgName}}',
    },
    bodyText: {
      de: 'Guten Tag,\n\nwir möchten Sie zu Ihrer Buchung {{bookingRef}} informieren.\n\n{{message}}\n\nMit freundlichen Grüßen\n{{orgName}}',
      en: 'Hello,\n\nWe would like to inform you about your booking {{bookingRef}}.\n\n{{message}}\n\nBest regards\n{{orgName}}',
    },
    bodyHtml: {
      de: '<p>Guten Tag,</p><p>wir möchten Sie zu Ihrer Buchung <strong>{{bookingRef}}</strong> informieren.</p><p>{{message}}</p><p>Mit freundlichen Grüßen<br/>{{orgName}}</p>',
      en: '<p>Hello,</p><p>We would like to inform you about your booking <strong>{{bookingRef}}</strong>.</p><p>{{message}}</p><p>Best regards<br/>{{orgName}}</p>',
    },
  },
  invoice_reminder: {
    templateId: 'invoice_reminder',
    version: '1.0.0',
    category: 'TRANSACTIONAL',
    enforceSendWindow: true,
    subjects: {
      de: 'Zahlungserinnerung — {{orgName}}',
      en: 'Payment reminder — {{orgName}}',
    },
    bodyText: {
      de: 'Guten Tag,\n\nbitte begleichen Sie die offene Rechnung {{invoiceRef}}.\n\n{{message}}\n\nMit freundlichen Grüßen\n{{orgName}}',
      en: 'Hello,\n\nPlease settle the outstanding invoice {{invoiceRef}}.\n\n{{message}}\n\nBest regards\n{{orgName}}',
    },
    bodyHtml: {
      de: '<p>Guten Tag,</p><p>bitte begleichen Sie die offene Rechnung <strong>{{invoiceRef}}</strong>.</p><p>{{message}}</p><p>Mit freundlichen Grüßen<br/>{{orgName}}</p>',
      en: '<p>Hello,</p><p>Please settle the outstanding invoice <strong>{{invoiceRef}}</strong>.</p><p>{{message}}</p><p>Best regards<br/>{{orgName}}</p>',
    },
  },
  workflow_operational: {
    templateId: 'workflow_operational',
    version: '1.0.0',
    category: 'TRANSACTIONAL',
    enforceSendWindow: false,
    subjects: {
      de: '{{subject}}',
      en: '{{subject}}',
    },
    bodyText: {
      de: '{{message}}',
      en: '{{message}}',
    },
    bodyHtml: {
      de: '<p>{{message}}</p>',
      en: '<p>{{message}}</p>',
    },
  },
};

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

export function isAllowedWorkflowEmailAttachmentMime(mimeType: string): boolean {
  return ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType.toLowerCase());
}

export function renderWorkflowEmailTemplate(
  template: WorkflowEmailTemplateDefinition,
  locale: WorkflowEmailLocale,
  params: Record<string, string>,
): { subject: string; bodyText: string; bodyHtml: string } {
  const loc = template.subjects[locale] ? locale : 'de';
  return {
    subject: interpolate(template.subjects[loc], params),
    bodyText: interpolate(template.bodyText[loc], params),
    bodyHtml: interpolate(template.bodyHtml[loc], params),
  };
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? '');
}
