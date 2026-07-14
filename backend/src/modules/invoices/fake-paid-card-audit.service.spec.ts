import { FakePaidCardAuditService } from './fake-paid-card-audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AUTO_BOOKING_PREPAY_NOTE } from './fake-paid-card-audit.util';

describe('FakePaidCardAuditService', () => {
  const orgId = 'org-audit-1';
  const bookingUpdatedAt = new Date('2026-06-10T14:00:00.000Z');

  function buildService(overrides: {
    payments?: Array<Record<string, unknown>>;
    bookings?: Array<Record<string, unknown>>;
    activityLogs?: Array<Record<string, unknown>>;
  } = {}) {
    const allPayments = overrides.payments ?? [];
    const prisma = {
      orgInvoicePayment: {
        findMany: jest.fn().mockImplementation(({ where }: { where?: { invoice?: { organizationId?: string } } }) => {
          const orgFilter = where?.invoice?.organizationId;
          if (!orgFilter) return allPayments;
          return allPayments.filter(
            (p) => (p.invoice as { organizationId: string }).organizationId === orgFilter,
          );
        }),
      },
      booking: {
        findMany: jest.fn().mockResolvedValue(overrides.bookings ?? []),
      },
      activityLog: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { entityId?: string } }) => {
          const logs = overrides.activityLogs ?? [];
          return logs.find((l) => l.entityId === where.entityId) ?? null;
        }),
      },
    };

    return new FakePaidCardAuditService(prisma as unknown as PrismaService);
  }

  it('returns HIGH candidate for classic fake card checkout payment', async () => {
    const service = buildService({
      payments: [
        {
          id: 'pay-fake-1',
          organizationId: orgId,
          amountCents: 15_000,
          method: 'CARD',
          reference: null,
          note: AUTO_BOOKING_PREPAY_NOTE,
          createdAt: new Date('2026-06-10T14:00:15.000Z'),
          invoice: {
            id: 'inv-1',
            organizationId: orgId,
            bookingId: 'bk-1',
            invoiceNumberDisplay: 'FSM-2026-0042',
            currency: 'EUR',
          },
        },
      ],
      bookings: [
        { id: 'bk-1', organizationId: orgId, updatedAt: bookingUpdatedAt },
      ],
    });

    const report = await service.runAudit({ organizationId: orgId });

    expect(report.readonly).toBe(true);
    expect(report.mode).toBe('audit');
    expect(report.summary.candidatesTotal).toBe(1);
    expect(report.summary.high).toBe(1);
    expect(report.candidates[0]).toMatchObject({
      organizationId: orgId,
      bookingId: 'bk-1',
      invoiceId: 'inv-1',
      paymentId: 'pay-fake-1',
      paymentMethod: 'CARD',
      confidence: 'HIGH',
    });
    expect(report.candidates[0].reasons.length).toBeGreaterThan(0);
    expect(report.humanSummary).toContain('Read-only');
  });

  it('excludes payment with Stripe reference from candidates', async () => {
    const service = buildService({
      payments: [
        {
          id: 'pay-stripe-1',
          organizationId: orgId,
          amountCents: 15_000,
          method: 'CARD',
          reference: 'pi_real_stripe_intent',
          note: AUTO_BOOKING_PREPAY_NOTE,
          createdAt: new Date('2026-06-10T14:00:15.000Z'),
          invoice: {
            id: 'inv-2',
            organizationId: orgId,
            bookingId: 'bk-2',
            invoiceNumberDisplay: 'FSM-2026-0043',
            currency: 'EUR',
          },
        },
      ],
      bookings: [
        { id: 'bk-2', organizationId: orgId, updatedAt: bookingUpdatedAt },
      ],
    });

    const report = await service.runAudit({ organizationId: orgId });
    expect(report.summary.candidatesTotal).toBe(0);
  });

  it('scopes audit to organizationId', async () => {
    const service = buildService({
      payments: [
        {
          id: 'pay-org2',
          organizationId: 'org-other',
          amountCents: 1000,
          method: 'CARD',
          reference: null,
          note: AUTO_BOOKING_PREPAY_NOTE,
          createdAt: new Date('2026-06-10T14:00:15.000Z'),
          invoice: {
            id: 'inv-3',
            organizationId: 'org-other',
            bookingId: 'bk-3',
            invoiceNumberDisplay: null,
            currency: 'EUR',
          },
        },
      ],
      bookings: [
        { id: 'bk-3', organizationId: 'org-other', updatedAt: bookingUpdatedAt },
      ],
    });

    const report = await service.runAudit({ organizationId: orgId });
    expect(report.summary.paymentsScanned).toBe(0);
    expect(report.summary.candidatesTotal).toBe(0);
  });
});
