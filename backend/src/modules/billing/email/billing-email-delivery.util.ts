import { OutboundEmailEventType } from '@prisma/client';

export interface BillingEmailTimelineEntry {
  at: string;
  kind: 'delivery' | 'outbound' | 'audit';
  status: string;
  label: string;
  detail?: string | null;
}

const OUTBOUND_EVENT_LABELS: Partial<Record<OutboundEmailEventType, string>> = {
  QUEUED: 'In Warteschlange',
  SENDING: 'Wird gesendet',
  SENT: 'An Provider übergeben',
  ACCEPTED: 'Von Resend akzeptiert',
  DELIVERED: 'Zugestellt',
  DEFERRED: 'Zustellung verzögert',
  BOUNCED: 'Zurückgewiesen (Bounce)',
  COMPLAINED: 'Als Spam gemeldet',
  FAILED: 'Senden fehlgeschlagen',
  OPENED: 'Geöffnet',
};

export function mapOutboundEventLabel(eventType: OutboundEmailEventType): string {
  return OUTBOUND_EVENT_LABELS[eventType] ?? eventType;
}

export function sanitizeBillingEmailLogDetail(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{4,}\b/g, '[number]')
    .slice(0, 300);
}

export function buildBillingEmailDeliveryStatus(input: {
  deliveryStatus: string;
  outboundStatus?: string | null;
  outboundEvents?: Array<{ eventType: OutboundEmailEventType; occurredAt: Date }>;
}): string {
  const terminal = input.outboundEvents?.slice().sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  )[0];
  if (terminal?.eventType === OutboundEmailEventType.BOUNCED) return 'BOUNCED';
  if (terminal?.eventType === OutboundEmailEventType.COMPLAINED) return 'COMPLAINED';
  if (terminal?.eventType === OutboundEmailEventType.DELIVERED) return 'DELIVERED';
  if (terminal?.eventType === OutboundEmailEventType.DEFERRED) return 'DEFERRED';
  if (terminal?.eventType === OutboundEmailEventType.ACCEPTED) return 'ACCEPTED';
  if (terminal?.eventType === OutboundEmailEventType.FAILED) return 'FAILED';
  if (input.deliveryStatus === 'DEAD_LETTER') return 'DEAD_LETTER';
  if (input.outboundStatus === 'SENT' || input.outboundStatus === 'SENT_SIMULATED') return 'SENT';
  return input.deliveryStatus;
}
