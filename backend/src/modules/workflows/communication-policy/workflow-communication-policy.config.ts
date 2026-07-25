/**
 * Documented legal basis references — configurable per organization.
 * These are technical reference codes only; they do not constitute legal advice.
 */
export const WORKFLOW_COMMUNICATION_POLICY_VERSION = '1.0.0';

export const WORKFLOW_COMMUNICATION_LEGAL_BASIS_CATALOG: Readonly<
  Record<
    string,
    {
      label: string;
      description: string;
      allowedPurposes: readonly ('transactional' | 'marketing' | 'support' | 'operational')[];
    }
  >
> = {
  'gdpr.art6.1.b.contract': {
    label: 'Contract performance (Art. 6(1)(b) GDPR)',
    description: 'Processing necessary for contract or pre-contractual steps.',
    allowedPurposes: ['transactional', 'operational'],
  },
  'gdpr.art6.1.f.legitimate_interest': {
    label: 'Legitimate interest (Art. 6(1)(f) GDPR)',
    description: 'Documented legitimate interest balancing — org must maintain LIA.',
    allowedPurposes: ['transactional', 'support', 'operational'],
  },
  'gdpr.art6.1.a.consent': {
    label: 'Consent (Art. 6(1)(a) GDPR)',
    description: 'Explicit opt-in required and recorded.',
    allowedPurposes: ['marketing', 'support'],
  },
  'gdpr.art6.1.c.legal_obligation': {
    label: 'Legal obligation (Art. 6(1)(c) GDPR)',
    description: 'Mandatory notices required by law.',
    allowedPurposes: ['transactional', 'operational'],
  },
};

export function isKnownLegalBasisRef(ref: string | null | undefined): boolean {
  if (!ref?.trim()) return false;
  return Object.prototype.hasOwnProperty.call(WORKFLOW_COMMUNICATION_LEGAL_BASIS_CATALOG, ref.trim());
}

export function legalBasisAllowsPurpose(
  ref: string,
  purpose: 'transactional' | 'marketing' | 'support' | 'operational',
): boolean {
  const entry = WORKFLOW_COMMUNICATION_LEGAL_BASIS_CATALOG[ref];
  if (!entry) return false;
  return entry.allowedPurposes.includes(purpose);
}

/** Default quiet hours: Mon–Fri 08:00–20:00 in org timezone. */
export const DEFAULT_QUIET_HOURS = {
  weekdayStartHour: 8,
  weekdayEndHour: 20,
  allowWeekends: false,
} as const;

/** Channel fallback order when primary channel is blocked but fallback is available. */
export const CHANNEL_FALLBACK_ORDER: Readonly<
  Partial<Record<WorkflowCommunicationChannel, WorkflowCommunicationChannel>>
> = {
  whatsapp: 'sms',
};

import type { WorkflowCommunicationChannel } from './workflow-communication-policy.types';
