import { buildInvoiceTimeline, buildInvoiceTimelineRawEvents, isLegacyReducedTimeline } from './invoice-timeline.builder';
import type { InvoiceTimelineBuildInput } from './invoice-timeline.builder';

function baseInput(overrides: Partial<InvoiceTimelineBuildInput> = {}): InvoiceTimelineBuildInput {
  return {
    invoice: {
      id: 'inv-1',
      type: 'OUTGOING_BOOKING',
      status: 'ISSUED',
      currency: 'EUR',
      totalCents: 10_000,
      paidCents: 0,
      invoiceNumberDisplay: 'FSM-2026-0001',
      sequenceNumber: 1,
      createdAt: new Date('2026-07-01T08:00:00Z'),
      issuedAt: new Date('2026-07-01T09:00:00Z'),
      sentAt: null,
      paidAt: null,
      dueDate: new Date('2026-07-15T00:00:00Z'),
      cancelledAt: null,
      voidedAt: null,
      creditedAt: null,
    },
    payments: [],
    documents: [],
    emails: [],
    activityLogs: [],
    timezone: 'Europe/Berlin',
    ...overrides,
  };
}

describe('invoice-timeline.builder', () => {
  it('sorts events newest first', () => {
    const input = baseInput({
      payments: [
        {
          id: 'pay-1',
          amountCents: 4_000,
          method: 'BANK_TRANSFER',
          paidAt: new Date('2026-07-10T10:00:00Z'),
          reference: 'REF-1',
          note: null,
          createdByUserId: null,
          createdByName: null,
        },
        {
          id: 'pay-2',
          amountCents: 6_000,
          method: 'BANK_TRANSFER',
          paidAt: new Date('2026-07-12T11:00:00Z'),
          reference: 'REF-2',
          note: null,
          createdByUserId: 'user-1',
          createdByName: 'Maria Admin',
        },
      ],
    });

    const dto = buildInvoiceTimeline(input);
    expect(dto.sortOrder).toBe('desc');
    const times = dto.events.map((e) => new Date(e.occurredAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('marks legacy invoices as reduced when only milestone fields exist', () => {
    const input = baseInput();
    expect(isLegacyReducedTimeline(input)).toBe(true);
    const dto = buildInvoiceTimeline(input);
    expect(dto.isLegacyReduced).toBe(true);
    expect(dto.events.some((e) => e.kind === 'INVOICE_CREATED')).toBe(true);
    expect(dto.events.some((e) => e.kind === 'INVOICE_ISSUED')).toBe(true);
  });

  it('uses unavailable actor label when issuer is unknown', () => {
    const dto = buildInvoiceTimeline(baseInput());
    const issued = dto.events.find((e) => e.kind === 'INVOICE_ISSUED');
    expect(issued?.actorLabel).toBe('Nicht verfügbar');
  });

  it('uses user actor when activity log provides creator', () => {
    const input = baseInput({
      activityLogs: [
        {
          id: 'log-1',
          action: 'CREATE',
          description: 'Rechnung erstellt',
          changeSummary: null,
          createdAt: new Date('2026-07-01T08:00:00Z'),
          userName: 'Tom Tenant',
          metaJson: { invoiceId: 'inv-1' },
        },
      ],
    });
    const created = buildInvoiceTimeline(input).events.find((e) => e.kind === 'INVOICE_CREATED');
    expect(created?.actorLabel).toBe('Tom Tenant');
  });

  it('maps mixed delivery and payment events without raw provider data', () => {
    const input = baseInput({
      emails: [
        {
          id: 'mail-1',
          toEmail: 'kunde@example.com',
          status: 'SENT',
          createdAt: new Date('2026-07-02T08:00:00Z'),
          sentAt: new Date('2026-07-02T08:00:05Z'),
          errorMessage: null,
          sentByName: 'Admin User',
          isRetry: false,
          events: [
            { eventType: 'QUEUED', occurredAt: new Date('2026-07-02T08:00:00Z') },
            { eventType: 'SENDING', occurredAt: new Date('2026-07-02T08:00:02Z') },
            { eventType: 'SENT', occurredAt: new Date('2026-07-02T08:00:05Z') },
            { eventType: 'DELIVERED', occurredAt: new Date('2026-07-02T08:05:00Z') },
          ],
          attachmentFileName: 'rechnung.pdf',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          amountCents: 5_000,
          method: 'STRIPE',
          paidAt: new Date('2026-07-03T09:00:00Z'),
          reference: null,
          note: null,
          createdByUserId: null,
          createdByName: null,
        },
      ],
    });

    const events = buildInvoiceTimeline(input).events;
    expect(events.some((e) => e.kind === 'DELIVERY_SENT' && e.channel === 'SynqDrive')).toBe(true);
    expect(events.some((e) => e.kind === 'DELIVERY_DELIVERED')).toBe(true);
    expect(events.some((e) => e.kind === 'PAYMENT_PARTIAL')).toBe(true);
    expect(events.every((e) => !e.reference?.includes('mail-1'))).toBe(true);
    expect(events.every((e) => !e.detail?.includes('resend'))).toBe(true);
  });

  it('dedupes email preparation when final send exists for same flow', () => {
    const raw = buildInvoiceTimelineRawEvents(
      baseInput({
        emails: [
          {
            id: 'mail-1',
            toEmail: 'kunde@example.com',
            status: 'SENT',
            createdAt: new Date('2026-07-02T08:00:00Z'),
            sentAt: new Date('2026-07-02T08:00:05Z'),
            errorMessage: null,
            sentByName: 'Admin',
            isRetry: false,
            events: [
              { eventType: 'QUEUED', occurredAt: new Date('2026-07-02T08:00:00Z') },
              { eventType: 'SENT', occurredAt: new Date('2026-07-02T08:00:05Z') },
            ],
            attachmentFileName: 'rechnung.pdf',
          },
        ],
      }),
    );

    const prepared = raw.filter((e) => e.kind === 'DELIVERY_PREPARED');
    const sent = raw.filter((e) => e.kind === 'DELIVERY_SENT');
    expect(prepared.length).toBe(0);
    expect(sent.length).toBe(1);
  });

  it('shows external sent only when no synqdrive email near sentAt', () => {
    const dto = buildInvoiceTimeline(
      baseInput({
        invoice: {
          ...baseInput().invoice,
          sentAt: new Date('2026-07-04T12:00:00Z'),
          status: 'SENT',
        },
      }),
    );
    expect(dto.events.some((e) => e.kind === 'DELIVERY_EXTERNALLY_MARKED')).toBe(true);
  });

  it('maps payment reversal from structured activity log', () => {
    const dto = buildInvoiceTimeline(
      baseInput({
        activityLogs: [
          {
            id: 'log-refund',
            action: 'SYNC',
            description: 'Zahlung zurückgebucht',
            changeSummary: 'Stripe-Rückerstattung',
            createdAt: new Date('2026-07-08T10:00:00Z'),
            userName: 'System Admin',
            metaJson: { invoiceId: 'inv-1', event: 'PAYMENT_REVERSED' },
          },
        ],
      }),
    );
    const reversal = dto.events.find((e) => e.kind === 'PAYMENT_REVERSED');
    expect(reversal?.actorLabel).toBe('System Admin');
    expect(reversal?.detail).toBe('Stripe-Rückerstattung');
  });
});
