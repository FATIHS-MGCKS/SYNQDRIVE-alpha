import { Prisma } from '@prisma/client';
import {
  BookingPaymentPurpose,
  BookingPaymentRequestStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { PrismaService } from '@shared/database/prisma.service';

const ORG_ID = 'org-pay-1';

describe('BookingPaymentRequestRepository', () => {
  const store = new Map<string, Record<string, unknown>>();

  const prisma = {
    bookingPaymentRequest: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
        const row = store.get(where.id);
        return row?.organizationId === where.organizationId ? row : null;
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { organizationId_idempotencyKey: { organizationId: string; idempotencyKey: string } } }) => {
          const hit = [...store.values()].find(
            (r) =>
              r.organizationId === where.organizationId_idempotencyKey.organizationId &&
              r.idempotencyKey === where.organizationId_idempotencyKey.idempotencyKey,
          );
          return hit ?? null;
        },
      ),
      findMany: jest.fn(async () => [...store.values()]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.organizationId}:${data.idempotencyKey}`;
        if ([...store.values()].some((r) => `${r.organizationId}:${r.idempotencyKey}` === key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['organization_id', 'idempotency_key'] },
          });
        }
        const row = { id: `bpr-${store.size + 1}`, version: 1, ...data };
        store.set(row.id as string, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.get(where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...data };
        store.set(where.id, updated);
        return updated;
      }),
    },
  };

  const repo = new BookingPaymentRequestRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('enforces unique organizationId + idempotencyKey on create', async () => {
    const input = {
      organizationId: ORG_ID,
      bookingId: 'bk-1',
      customerId: 'cust-1',
      purpose: BookingPaymentPurpose.BOOKING_INVOICE,
      amountCents: 10_000,
      idempotencyKey: 'idem-1',
    };
    await repo.create(input);
    await expect(repo.create(input)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('finds existing request by idempotency key', async () => {
    await repo.create({
      organizationId: ORG_ID,
      bookingId: 'bk-1',
      customerId: 'cust-1',
      purpose: BookingPaymentPurpose.BOOKING_INVOICE,
      amountCents: 5000,
      idempotencyKey: 'idem-lookup',
    });
    const found = await repo.findByIdempotencyKey(ORG_ID, 'idem-lookup');
    expect(found?.amountCents).toBe(5000);
    expect(found?.status).toBe(BookingPaymentRequestStatus.DRAFT);
  });
});

describe('PaymentTransactionRepository (append-only)', () => {
  const rows: Record<string, unknown>[] = [];

  const prisma = {
    paymentTransaction: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const dup = rows.find(
          (r) =>
            r.provider === data.provider &&
            r.providerEventId === data.providerEventId &&
            r.type === data.type,
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['provider', 'provider_event_id', 'type'] },
          });
        }
        const row = { id: `ptx-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async () => rows),
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            provider_providerEventId_type: {
              provider: PaymentProvider;
              providerEventId: string;
              type: PaymentTransactionType;
            };
          };
        }) => {
          const { provider, providerEventId, type } = where.provider_providerEventId_type;
          return (
            rows.find(
              (r) => r.provider === provider && r.providerEventId === providerEventId && r.type === type,
            ) ?? null
          );
        },
      ),
    },
  };

  const repo = new PaymentTransactionRepository(prisma as unknown as PrismaService);

  beforeEach(() => {
    rows.length = 0;
    jest.clearAllMocks();
  });

  it('appends ledger rows and dedupes by provider event + type', async () => {
    const base = {
      organizationId: ORG_ID,
      paymentRequestId: 'bpr-1',
      type: PaymentTransactionType.CHARGE,
      amountCents: 10_000,
      occurredAt: new Date('2026-07-14T12:00:00.000Z'),
      providerEventId: 'evt_123',
      status: PaymentTransactionStatus.SUCCEEDED,
    };
    await repo.append(base);
    await expect(repo.append(base)).rejects.toMatchObject({ code: 'P2002' });
    expect(rows).toHaveLength(1);
  });

  it('exposes no update or delete methods', () => {
    expect((repo as unknown as { update?: unknown }).update).toBeUndefined();
    expect((repo as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
