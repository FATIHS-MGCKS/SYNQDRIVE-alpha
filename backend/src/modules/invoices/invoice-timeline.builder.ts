import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { displayInvoiceNumber } from './invoice-domain.util';
import {
  actorLabelFromName,
  formatMoneyCents,
  invoicePaymentMethodLabel,
  invoiceTimelineEventLabel,
} from './invoice-timeline.labels';
import type {
  InvoiceTimelineDto,
  InvoiceTimelineEventDto,
  InvoiceTimelineRawEvent,
  InvoiceTimelineTone,
} from './invoice-timeline.types';

const MERGE_WINDOW_MS = 3_000;

export interface InvoiceTimelineBuildInput {
  invoice: {
    id: string;
    type: string;
    status: string;
    currency: string;
    totalCents: number;
    paidCents: number;
    invoiceNumberDisplay: string | null;
    sequenceNumber: number | null;
    createdAt: Date;
    issuedAt: Date | null;
    sentAt: Date | null;
    paidAt: Date | null;
    dueDate: Date | null;
    cancelledAt: Date | null;
    voidedAt: Date | null;
    creditedAt: Date | null;
  };
  payments: Array<{
    id: string;
    amountCents: number;
    method: string;
    paidAt: Date;
    reference: string | null;
    note: string | null;
    createdByUserId: string | null;
    createdByName: string | null;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    status: string;
    generatedAt: Date | null;
    createdAt: Date;
    voidedAt: Date | null;
    generatedByName: string | null;
  }>;
  emails: Array<{
    id: string;
    toEmail: string;
    status: string;
    createdAt: Date;
    sentAt: Date | null;
    errorMessage: string | null;
    sentByName: string | null;
    isRetry: boolean;
    events: Array<{ eventType: string; occurredAt: Date }>;
    attachmentFileName: string | null;
  }>;
  activityLogs: Array<{
    id: string;
    action: string;
    description: string;
    changeSummary: string | null;
    createdAt: Date;
    userName: string | null;
    metaJson: Record<string, unknown> | null;
  }>;
  timezone: string;
}

function toneForKind(kind: InvoiceTimelineRawEvent['kind']): InvoiceTimelineTone {
  switch (kind) {
    case 'PAYMENT_FULL':
    case 'DELIVERY_DELIVERED':
    case 'DELIVERY_SENT':
    case 'PDF_GENERATED':
      return 'success';
    case 'DELIVERY_FAILED':
    case 'PDF_GENERATION_FAILED':
    case 'INVOICE_CANCELLED':
    case 'PAYMENT_REVERSED':
      return 'critical';
    case 'INVOICE_OVERDUE':
    case 'PAYMENT_PARTIAL':
    case 'DELIVERY_PREPARED':
      return 'watch';
    case 'INVOICE_ISSUED':
    case 'DELIVERY_EXTERNALLY_MARKED':
    case 'DELIVERY_RETRY':
      return 'info';
    default:
      return 'neutral';
  }
}

function push(events: InvoiceTimelineRawEvent[], event: InvoiceTimelineRawEvent): void {
  events.push({ ...event, tone: event.tone ?? toneForKind(event.kind) });
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeReference(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (isUuidLike(trimmed)) return null;
  return trimmed;
}

export function buildInvoiceTimelineRawEvents(input: InvoiceTimelineBuildInput): InvoiceTimelineRawEvent[] {
  const events: InvoiceTimelineRawEvent[] = [];
  const inv = input.invoice;
  const displayNumber = displayInvoiceNumber(inv as Parameters<typeof displayInvoiceNumber>[0]);

  const createdActor = resolveCreatedActor(input.activityLogs);
  push(events, {
    id: `created-${inv.id}`,
    kind: 'INVOICE_CREATED',
    occurredAt: inv.createdAt,
    actorType: createdActor.actorType,
    actorName: createdActor.actorName,
    channel: null,
    reference: sanitizeReference(displayNumber !== 'Entwurf' ? displayNumber : null),
    detail: null,
    tone: 'neutral',
    source: 'invoice',
  });

  if (inv.issuedAt) {
    const issuedActor = resolveIssuedActor(input.activityLogs, inv.issuedAt);
    push(events, {
      id: `issued-${inv.id}`,
      kind: 'INVOICE_ISSUED',
      occurredAt: inv.issuedAt,
      actorType: issuedActor.actorType,
      actorName: issuedActor.actorName,
      channel: null,
      reference: sanitizeReference(displayNumber),
      detail: inv.sequenceNumber != null ? `Nummer ${displayNumber}` : null,
      tone: 'info',
      source: 'invoice',
      dedupeKey: `issue-${inv.id}`,
    });
  } else if (inv.sequenceNumber != null && inv.invoiceNumberDisplay) {
    push(events, {
      id: `number-${inv.id}`,
      kind: 'INVOICE_NUMBER_ASSIGNED',
      occurredAt: inv.createdAt,
      actorType: 'system',
      actorName: null,
      channel: null,
      reference: sanitizeReference(displayNumber),
      detail: null,
      tone: 'neutral',
      source: 'invoice',
    });
  }

  buildDocumentEvents(input, events, displayNumber);
  buildEmailEvents(input, events);
  buildExternalSentEvent(input, events);
  buildPaymentEvents(input, events, displayNumber);
  buildStatusMilestoneEvents(input, events, displayNumber);
  buildActivityEvents(input, events, displayNumber);

  return dedupeAndMerge(events);
}

function buildDocumentEvents(
  input: InvoiceTimelineBuildInput,
  events: InvoiceTimelineRawEvent[],
  displayNumber: string,
): void {
  const sorted = [...input.documents].sort(
    (a, b) => (a.generatedAt ?? a.createdAt).getTime() - (b.generatedAt ?? b.createdAt).getTime(),
  );
  const active = sorted.filter((d) => d.status !== DOCUMENT_STATUS.VOID);
  const failed = sorted.filter((d) => d.status === DOCUMENT_STATUS.FAILED);

  for (const doc of failed) {
    push(events, {
      id: `doc-failed-${doc.id}`,
      kind: 'PDF_GENERATION_FAILED',
      occurredAt: doc.generatedAt ?? doc.createdAt,
      actorType: doc.generatedByName ? 'user' : 'system',
      actorName: doc.generatedByName,
      channel: null,
      reference: sanitizeReference(doc.fileName) ?? sanitizeReference(displayNumber),
      detail: 'PDF konnte nicht erzeugt werden',
      tone: 'critical',
      source: 'document',
    });
  }

  active.forEach((doc, index) => {
    const at = doc.generatedAt ?? doc.createdAt;
    const isReplacement = index > 0 || sorted.some((d) => d.voidedAt && d.voidedAt <= at);
    push(events, {
      id: `doc-${doc.id}`,
      kind: isReplacement ? 'PDF_VERSION_REPLACED' : 'PDF_GENERATED',
      occurredAt: at,
      actorType: doc.generatedByName ? 'user' : 'system',
      actorName: doc.generatedByName,
      channel: null,
      reference: sanitizeReference(doc.fileName),
      detail: isReplacement ? 'Neue PDF-Version erzeugt' : null,
      tone: 'success',
      source: 'document',
    });
  });
}

function buildEmailEvents(input: InvoiceTimelineBuildInput, events: InvoiceTimelineRawEvent[]): void {
  for (const email of input.emails) {
    const actorType = email.sentByName ? 'user' : email.isRetry ? 'automation' : 'system';
    const ref = sanitizeReference(email.attachmentFileName ?? email.toEmail);

    const queued = email.events.find((e) => e.eventType === 'QUEUED');
    const sending = email.events.find((e) => e.eventType === 'SENDING');
  const preparedAt = queued?.occurredAt ?? sending?.occurredAt ?? email.createdAt;

    if (email.status === 'QUEUED' || queued || sending) {
      push(events, {
        id: `email-prep-${email.id}`,
        kind: 'DELIVERY_PREPARED',
        occurredAt: preparedAt,
        actorType,
        actorName: email.sentByName,
        channel: 'E-Mail',
        reference: ref,
        detail: email.toEmail ? `An ${email.toEmail}` : null,
        tone: 'watch',
        source: 'email',
        dedupeKey: `email-flow-${email.id}`,
      });
    }

    if (email.isRetry && (email.status === 'SENT' || email.status === 'SENT_SIMULATED')) {
      push(events, {
        id: `email-retry-${email.id}`,
        kind: 'DELIVERY_RETRY',
        occurredAt: email.sentAt ?? email.createdAt,
        actorType,
        actorName: email.sentByName,
        channel: 'E-Mail',
        reference: ref,
        detail: email.toEmail ? `An ${email.toEmail}` : null,
        tone: 'info',
        source: 'email',
      });
    }

    if (email.status === 'SENT' || email.status === 'SENT_SIMULATED') {
      push(events, {
        id: `email-sent-${email.id}`,
        kind: 'DELIVERY_SENT',
        occurredAt: email.sentAt ?? email.createdAt,
        actorType,
        actorName: email.sentByName,
        channel: 'SynqDrive',
        reference: ref,
        detail: email.toEmail ? `An ${email.toEmail}` : null,
        tone: 'success',
        source: 'email',
        dedupeKey: `email-flow-${email.id}`,
      });
    }

    if (email.status === 'FAILED') {
      push(events, {
        id: `email-failed-${email.id}`,
        kind: 'DELIVERY_FAILED',
        occurredAt: email.sentAt ?? email.createdAt,
        actorType,
        actorName: email.sentByName,
        channel: 'E-Mail',
        reference: ref,
        detail: email.errorMessage ?? 'Versand fehlgeschlagen',
        tone: 'critical',
        source: 'email',
        dedupeKey: `email-flow-${email.id}`,
      });
    }

    const delivered = email.events.find((e) => e.eventType === 'DELIVERED');
    if (delivered) {
      push(events, {
        id: `email-delivered-${email.id}`,
        kind: 'DELIVERY_DELIVERED',
        occurredAt: delivered.occurredAt,
        actorType: 'system',
        actorName: null,
        channel: 'E-Mail',
        reference: ref,
        detail: email.toEmail ? `An ${email.toEmail}` : null,
        tone: 'success',
        source: 'email',
      });
    }
  }
}

function buildExternalSentEvent(input: InvoiceTimelineBuildInput, events: InvoiceTimelineRawEvent[]): void {
  const inv = input.invoice;
  if (!inv.sentAt) return;

  const hasSynqEmailNearSent = input.emails.some((email) => {
    const at = email.sentAt ?? email.createdAt;
    return Math.abs(at.getTime() - inv.sentAt!.getTime()) <= 5 * 60 * 1000;
  });
  if (hasSynqEmailNearSent) return;

  push(events, {
    id: `external-sent-${inv.id}`,
    kind: 'DELIVERY_EXTERNALLY_MARKED',
    occurredAt: inv.sentAt,
    actorType: 'user',
    actorName: null,
    channel: 'Manuell',
    reference: sanitizeReference(displayInvoiceNumber(inv as Parameters<typeof displayInvoiceNumber>[0])),
    detail: 'Als extern versendet markiert',
    tone: 'info',
    source: 'invoice',
  });
}

function buildPaymentEvents(
  input: InvoiceTimelineBuildInput,
  events: InvoiceTimelineRawEvent[],
  displayNumber: string,
): void {
  const sorted = [...input.payments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  let runningPaid = 0;

  for (const payment of sorted) {
    runningPaid += payment.amountCents;
    const isFull = runningPaid >= input.invoice.totalCents;
    const actorType = payment.createdByName ? 'user' : payment.createdByUserId ? 'unavailable' : 'system';

    push(events, {
      id: `payment-${payment.id}`,
      kind: isFull ? 'PAYMENT_FULL' : 'PAYMENT_PARTIAL',
      occurredAt: payment.paidAt,
      actorType,
      actorName: payment.createdByName,
      channel: invoicePaymentMethodLabel(payment.method),
      reference: sanitizeReference(payment.reference) ?? sanitizeReference(displayNumber),
      detail: formatMoneyCents(payment.amountCents, input.invoice.currency),
      tone: isFull ? 'success' : 'watch',
      source: 'payment',
    });
  }
}

function buildStatusMilestoneEvents(
  input: InvoiceTimelineBuildInput,
  events: InvoiceTimelineRawEvent[],
  displayNumber: string,
): void {
  const inv = input.invoice;

  if (inv.status === 'OVERDUE' && inv.dueDate) {
    push(events, {
      id: `overdue-${inv.id}`,
      kind: 'INVOICE_OVERDUE',
      occurredAt: inv.dueDate,
      actorType: 'system',
      actorName: null,
      channel: null,
      reference: sanitizeReference(displayNumber),
      detail: 'Fälligkeit überschritten',
      tone: 'watch',
      source: 'invoice',
    });
  }

  if (inv.cancelledAt) {
    push(events, {
      id: `cancelled-${inv.id}`,
      kind: 'INVOICE_CANCELLED',
      occurredAt: inv.cancelledAt,
      actorType: 'unavailable',
      actorName: null,
      channel: null,
      reference: sanitizeReference(displayNumber),
      detail: null,
      tone: 'critical',
      source: 'invoice',
    });
  }

  if (inv.creditedAt) {
    push(events, {
      id: `credited-${inv.id}`,
      kind: 'INVOICE_CREDITED',
      occurredAt: inv.creditedAt,
      actorType: 'unavailable',
      actorName: null,
      channel: null,
      reference: sanitizeReference(displayNumber),
      detail: null,
      tone: 'neutral',
      source: 'invoice',
    });
  }

  if (inv.voidedAt) {
    push(events, {
      id: `voided-${inv.id}`,
      kind: 'INVOICE_VOIDED',
      occurredAt: inv.voidedAt,
      actorType: 'system',
      actorName: null,
      channel: null,
      reference: sanitizeReference(displayNumber),
      detail: null,
      tone: 'critical',
      source: 'invoice',
    });
  }
}

function buildActivityEvents(
  input: InvoiceTimelineBuildInput,
  events: InvoiceTimelineRawEvent[],
  displayNumber: string,
): void {
  for (const log of input.activityLogs) {
    const meta = log.metaJson ?? {};
    const eventKey = String(meta.event ?? meta.kind ?? '').toUpperCase();

    if (eventKey === 'PAYMENT_REVERSED' || /zurückgebucht|refund|reversed/i.test(log.description)) {
      push(events, {
        id: `audit-reversal-${log.id}`,
        kind: 'PAYMENT_REVERSED',
        occurredAt: log.createdAt,
        actorType: log.userName ? 'user' : 'system',
        actorName: log.userName,
        channel: 'Stripe',
        reference: sanitizeReference(displayNumber),
        detail: sanitizeReference(log.changeSummary) ?? sanitizeReference(log.description),
        tone: 'critical',
        source: 'activity',
      });
      continue;
    }

    if (eventKey === 'INVOICE_ISSUED' || eventKey === 'INVOICE_MARK_SENT') {
      continue;
    }

    if (/^POST\s+\/api/i.test(log.description)) {
      continue;
    }
  }
}

function resolveCreatedActor(
  logs: InvoiceTimelineBuildInput['activityLogs'],
): { actorType: 'user' | 'system' | 'automation' | 'unavailable'; actorName: string | null } {
  const createLog = logs.find(
    (l) =>
      l.action === 'Created' ||
      l.action === 'CREATE' ||
      /rechnung.*erstellt/i.test(l.description),
  );
  if (createLog?.userName) {
    return { actorType: 'user', actorName: createLog.userName };
  }
  return { actorType: 'system', actorName: null };
}

function resolveIssuedActor(
  logs: InvoiceTimelineBuildInput['activityLogs'],
  issuedAt: Date,
): { actorType: 'user' | 'system' | 'automation' | 'unavailable'; actorName: string | null } {
  const match = logs.find((l) => {
    const meta = l.metaJson ?? {};
    if (String(meta.event ?? '').toUpperCase() === 'INVOICE_ISSUED') return true;
    return /ausgestellt|issued/i.test(l.description) && Math.abs(l.createdAt.getTime() - issuedAt.getTime()) < 60_000;
  });
  if (match?.userName) return { actorType: 'user', actorName: match.userName };
  return { actorType: 'unavailable', actorName: null };
}

export function dedupeAndMerge(events: InvoiceTimelineRawEvent[]): InvoiceTimelineRawEvent[] {
  const byDedupe = new Map<string, InvoiceTimelineRawEvent>();

  for (const event of events) {
    if (event.dedupeKey) {
      const existing = byDedupe.get(event.dedupeKey);
      if (existing) {
        const kindsToKeepLatest = new Set(['DELIVERY_PREPARED', 'DELIVERY_SENT', 'DELIVERY_FAILED']);
        if (kindsToKeepLatest.has(event.kind)) {
          byDedupe.set(event.dedupeKey, event);
        }
        continue;
      }
      byDedupe.set(event.dedupeKey, event);
    }
  }

  const merged = events.filter((e) => !e.dedupeKey || byDedupe.get(e.dedupeKey)?.id === e.id);

  const issued = merged.find((e) => e.kind === 'INVOICE_ISSUED');
  const withoutNumberOnly = merged.filter((e) => {
    if (e.kind !== 'INVOICE_NUMBER_ASSIGNED') return true;
    if (!issued) return true;
    return Math.abs(e.occurredAt.getTime() - issued.occurredAt.getTime()) > MERGE_WINDOW_MS;
  });

  return withoutNumberOnly.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

export function isLegacyReducedTimeline(input: InvoiceTimelineBuildInput): boolean {
  const hasStructured =
    input.payments.length > 0 ||
    input.documents.length > 0 ||
    input.emails.length > 0 ||
    input.activityLogs.some((l) => l.metaJson && Object.keys(l.metaJson).length > 0);

  return !hasStructured;
}

export function toTimelineDto(
  rawEvents: InvoiceTimelineRawEvent[],
  input: InvoiceTimelineBuildInput,
): InvoiceTimelineDto {
  const events: InvoiceTimelineEventDto[] = rawEvents.map((event) => ({
    id: event.id,
    kind: event.kind,
    label: invoiceTimelineEventLabel(event.kind),
    occurredAt: event.occurredAt.toISOString(),
    actorType: event.actorType,
    actorLabel: actorLabelFromName(event.actorType, event.actorName),
    channel: event.channel,
    reference: event.reference,
    detail: event.detail,
    tone: event.tone,
  }));

  return {
    events,
    sortOrder: 'desc',
    isLegacyReduced: isLegacyReducedTimeline(input),
    timezone: input.timezone,
  };
}

export function buildInvoiceTimeline(input: InvoiceTimelineBuildInput): InvoiceTimelineDto {
  const raw = buildInvoiceTimelineRawEvents(input);
  return toTimelineDto(raw, input);
}
