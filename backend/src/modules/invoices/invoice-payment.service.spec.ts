import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InvoicePaymentMethod,
  InvoicePaymentSource,
  OrgInvoiceStatus,
  OrgInvoiceType,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicePaymentService } from './invoice-payment.service';

const ORG = 'org-a';
const ORG_B = 'org-b';
const INV = 'inv-1';
const USER = 'user-1';

describe('InvoicePaymentService', () => {
  let service: InvoicePaymentService;
  let invoiceState: Record<string, unknown>;
  let createdPayments: Map<string, Record<string, unknown>>;

  const prisma: {
    orgInvoice: { findFirst: jest.Mock; update: jest.Mock };
    orgInvoicePayment: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    orgTask: { findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  } = {
    orgInvoice: { findFirst: jest.fn(), update: jest.fn() },
    orgInvoicePayment: { findFirst: jest.fn(), create: jest.fn() },
    orgTask: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };
  const activityLog = { log: jest.fn() };

  function resetInvoice(overrides: Record<string, unknown> = {}) {
    invoiceState = {
      id: INV,
      organizationId: ORG,
      type: OrgInvoiceType.OUTGOING_MANUAL,
      status: OrgInvoiceStatus.ISSUED,
      currency: 'EUR',
      totalCents: 10_000,
      paidCents: 0,
      outstandingCents: 10_000,
      paidAt: null,
      ...overrides,
    };
  }

  function wireMocks() {
    createdPayments = new Map();

    prisma.orgInvoice.findFirst.mockImplementation(
      async (args?: { where?: { id?: string; organizationId?: string } }) => {
        if (
          args?.where?.id === INV &&
          args?.where?.organizationId &&
          args.where.organizationId !== invoiceState.organizationId
        ) {
          return null;
        }
        if (args?.where?.id === INV) return invoiceState;
        return null;
      },
    );

    prisma.orgInvoicePayment.findFirst.mockImplementation(
      async (args?: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        if (where.id) return createdPayments.get(String(where.id)) ?? null;
        if (where.idempotencyKey) {
          for (const p of createdPayments.values()) {
            if (p.idempotencyKey === where.idempotencyKey) return p;
          }
          return null;
        }
        if (where.providerTransactionId) {
          for (const p of createdPayments.values()) {
            if (p.providerTransactionId === where.providerTransactionId) return p;
          }
          return null;
        }
        return null;
      },
    );

    prisma.orgInvoicePayment.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        const payment = {
          id: `pay-${createdPayments.size + 1}`,
          organizationId: ORG,
          invoiceId: INV,
          paidAt: data.paidAt ?? new Date('2026-07-14T12:00:00.000Z'),
          createdAt: new Date(),
          reference: null,
          note: null,
          providerTransactionId: null,
          idempotencyKey: null,
          ...data,
        };
        createdPayments.set(payment.id as string, payment);

        const newPaid = (invoiceState.paidCents as number) + (data.amountCents as number);
        const newOutstanding = Math.max(0, (invoiceState.totalCents as number) - newPaid);
        const newStatus =
          newOutstanding === 0
            ? OrgInvoiceStatus.PAID
            : newPaid > 0
              ? OrgInvoiceStatus.PARTIALLY_PAID
              : invoiceState.status;

        invoiceState = {
          ...invoiceState,
          paidCents: newPaid,
          outstandingCents: newOutstanding,
          status: newStatus,
          paidAt: newOutstanding === 0 ? payment.paidAt : invoiceState.paidAt,
        };

        return payment;
      },
    );

    prisma.orgInvoice.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        invoiceState = { ...invoiceState, ...data };
        return invoiceState;
      },
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetInvoice();
    wireMocks();
    prisma.orgTask.findMany.mockResolvedValue([]);
    service = new InvoicePaymentService(
      prisma as unknown as PrismaService,
      activityLog as unknown as ActivityLogService,
    );
  });

  it('records partial bank transfer payment', async () => {
    const result = await service.recordPayment(ORG, INV, USER, {
      amountCents: 4_000,
      paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
      currency: 'EUR',
      reference: 'REF-1',
    });

    expect(result.payment.method).toBe('BANK_TRANSFER');
    expect(result.payment.methodLabel).toBe('Überweisung');
    expect(result.invoice.status).toBe('PARTIALLY_PAID');
    expect(result.invoice.outstandingCents).toBe(6_000);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('records full card payment and closes linked tasks', async () => {
    prisma.orgTask.findMany.mockResolvedValue([{ id: 'task-1', status: 'OPEN' }]);

    const result = await service.recordPayment(ORG, INV, USER, {
      amountCents: 10_000,
      paymentMethod: InvoicePaymentMethod.CARD,
    });

    expect(result.payment.methodLabel).toBe('Karte');
    expect(result.invoice.status).toBe('PAID');
    expect(prisma.orgTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ status: 'DONE' }),
    });
  });

  it('records cash payment', async () => {
    const result = await service.recordPayment(ORG, INV, USER, {
      amountCents: 2_500,
      paymentMethod: InvoicePaymentMethod.CASH,
    });

    expect(result.payment.method).toBe('CASH');
    expect(result.payment.methodLabel).toBe('Bar');
  });

  it('records stripe provider payment with PROVIDER source', async () => {
    const result = await service.recordPayment(ORG, INV, USER, {
      amountCents: 10_000,
      paymentMethod: InvoicePaymentMethod.STRIPE,
      providerTransactionId: 'pi_stripe_1',
    });

    expect(result.payment.source).toBe('PROVIDER');
    expect(result.payment.providerTransactionId).toBe('pi_stripe_1');
    expect(prisma.orgInvoicePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: InvoicePaymentSource.PROVIDER,
          providerTransactionId: 'pi_stripe_1',
        }),
      }),
    );
  });

  it('rejects overpayment', async () => {
    await expect(
      service.recordPayment(ORG, INV, USER, {
        amountCents: 10_001,
        paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects wrong currency', async () => {
    await expect(
      service.recordPayment(ORG, INV, USER, {
        amountCents: 100,
        paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payment without paymentMethod', async () => {
    await expect(
      service.recordPayment(ORG, INV, USER, {
        amountCents: 100,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces cross-tenant isolation', async () => {
    await expect(
      service.recordPayment(ORG_B, INV, USER, {
        amountCents: 100,
        paymentMethod: InvoicePaymentMethod.CASH,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replays idempotent payment by idempotencyKey', async () => {
    await service.recordPayment(ORG, INV, USER, {
      amountCents: 5_000,
      paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
      idempotencyKey: 'idem-1',
    });

    const result = await service.recordPayment(ORG, INV, USER, {
      amountCents: 5_000,
      paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
      idempotencyKey: 'idem-1',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(createdPayments.size).toBe(1);
  });

  it('replays duplicate provider transaction idempotently', async () => {
    await service.recordPayment(ORG, INV, USER, {
      amountCents: 10_000,
      paymentMethod: InvoicePaymentMethod.STRIPE,
      providerTransactionId: 'pi_dup',
    });

    const result = await service.recordPayment(ORG, INV, USER, {
      amountCents: 10_000,
      paymentMethod: InvoicePaymentMethod.STRIPE,
      providerTransactionId: 'pi_dup',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(createdPayments.size).toBe(1);
  });

  it('recordFullBalancePayment uses explicit paymentMethod (no BANK_TRANSFER default)', async () => {
    const result = await service.recordFullBalancePayment(
      ORG,
      INV,
      USER,
      InvoicePaymentMethod.CASH,
    );

    expect(result.payment.method).toBe('CASH');
    expect(prisma.orgInvoicePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: InvoicePaymentMethod.CASH,
          amountCents: 10_000,
        }),
      }),
    );
  });

  it('rejects payment on cancelled invoice', async () => {
    resetInvoice({ status: OrgInvoiceStatus.CANCELLED });
    wireMocks();

    await expect(
      service.recordPayment(ORG, INV, USER, {
        amountCents: 100,
        paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
