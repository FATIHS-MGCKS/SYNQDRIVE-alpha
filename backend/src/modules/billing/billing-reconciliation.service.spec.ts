import {
  BillingReconciliationDriftType,
  BillingReconciliationRunStatus,
  BillingStatus,
  BillingStripeMode,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { BillingReconciliationService } from './billing-reconciliation.service';
import * as stripeClientUtil from './stripe-client.util';

describe('BillingReconciliationService', () => {
  const orgId = 'org-batch-1';
  const subscriptionId = 'sub-batch-1';

  let runs: any[];
  let drifts: any[];
  let subscriptions: any[];
  let webhooks: any[];
  let paymentMethods: any[];

  const stripeMock = {
    subscriptions: {
      retrieve: jest.fn(),
      list: jest.fn(),
    },
    customers: {
      retrieve: jest.fn(),
    },
    invoices: {
      list: jest.fn(),
    },
  };

  const prisma: any = {
    billingReconciliationRun: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `run-${runs.length + 1}`, ...data };
        runs.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        runs.find((row) => row.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = runs.find((item) => item.id === where.id);
        if (data.totalScanned?.increment) {
          row.totalScanned = (row.totalScanned ?? 0) + data.totalScanned.increment;
          delete data.totalScanned;
        }
        if (data.driftCount?.increment) {
          row.driftCount = (row.driftCount ?? 0) + data.driftCount.increment;
          delete data.driftCount;
        }
        if (data.errorCount?.increment) {
          row.errorCount = (row.errorCount ?? 0) + data.errorCount.increment;
          delete data.errorCount;
        }
        Object.assign(row, data);
        return row;
      }),
    },
    billingReconciliationDrift: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.idempotencyKey
          ? drifts.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null
          : drifts.find((row) => row.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `drift-${drifts.length + 1}`, ...data };
        drifts.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = drifts.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    billingSubscription: {
      findMany: jest.fn(async ({ where, take }: any) => {
        let rows = [...subscriptions];
        if (where.organizationId) {
          rows = rows.filter((row) => row.organizationId === where.organizationId);
        }
        if (where.id?.gt) {
          rows = rows.filter((row) => row.id > where.id.gt);
        }
        return rows.slice(0, take ?? rows.length);
      }),
    },
    billingPaymentMethod: {
      findMany: jest.fn(async ({ where }: any) =>
        paymentMethods.filter((row) => row.organizationId === where.organizationId),
      ),
    },
    stripeWebhookEvent: {
      findMany: jest.fn(async () => webhooks),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };

  const catalogMappings = {
    getRuntimeStripeMode: jest.fn(() => BillingStripeMode.TEST),
    getMappingForVersion: jest.fn(async () => ({
      stripePriceId: 'price_expected',
    })),
  };
  const paymentMethodService = {
    syncPaymentMethods: jest.fn(async () => ({ synced: 1 })),
  };
  const audit = { log: jest.fn() };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'stripe.secretKey' ? 'sk_test_reconciliation' : undefined,
    ),
  };

  let service: BillingReconciliationService;

  const matchedStripeSubscription = {
    id: 'sub_stripe_1',
    status: 'active',
    livemode: false,
    billing_cycle_anchor: Math.floor(new Date('2026-07-15T12:00:00.000Z').getTime() / 1000),
    metadata: {
      organizationId: orgId,
      synqdriveSubscriptionId: subscriptionId,
    },
    items: {
      data: [
        {
          id: 'si_1',
          quantity: 3,
          metadata: { synqdriveSubscriptionItemId: 'item-1' },
          price: { id: 'price_expected' },
        },
      ],
    },
    discounts: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runs = [];
    drifts = [];
    webhooks = [];
    paymentMethods = [];
    subscriptions = [
      {
        id: subscriptionId,
        organizationId: orgId,
        status: BillingStatus.ACTIVE,
        stripeSubscriptionId: 'sub_stripe_1',
        stripeCustomerId: 'cus_1',
        stripeMode: BillingStripeMode.TEST,
        billingAnchorDay: 15,
        items: [
          {
            id: 'item-1',
            status: BillingSubscriptionItemStatus.ACTIVE,
            quantity: 3,
            priceVersionId: 'pv-1',
            stripeSubscriptionItemId: 'si_1',
            stripeMode: BillingStripeMode.TEST,
            validTo: null,
          },
        ],
        discounts: [],
        invoices: [],
      },
    ];

    stripeMock.subscriptions.retrieve.mockResolvedValue(matchedStripeSubscription);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.customers.retrieve.mockResolvedValue({
      id: 'cus_1',
      invoice_settings: { default_payment_method: null },
    });
    stripeMock.invoices.list.mockResolvedValue({ data: [] });

    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as any);

    service = new BillingReconciliationService(
      prisma,
      configService as any,
      catalogMappings as any,
      paymentMethodService as any,
      audit as any,
    );
  });

  it('reports no drift when local and stripe are aligned', async () => {
    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });

    expect(result.driftCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.status).toBe(BillingReconciliationRunStatus.COMPLETED);
    expect(drifts).toHaveLength(0);
  });

  it('detects quantity drift and persists drift record', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      ...matchedStripeSubscription,
      items: {
        data: [{ ...matchedStripeSubscription.items.data[0], quantity: 7 }],
      },
    });

    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });

    expect(result.driftCount).toBe(1);
    expect(drifts[0]).toMatchObject({
      driftType: BillingReconciliationDriftType.QUANTITY_MISMATCH,
      localValue: '3',
      stripeValue: '7',
      autoFixable: false,
    });
  });

  it('detects price drift', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      ...matchedStripeSubscription,
      items: {
        data: [
          {
            ...matchedStripeSubscription.items.data[0],
            price: { id: 'price_wrong' },
          },
        ],
      },
    });

    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });
    expect(result.drifts[0]?.driftType).toBe(BillingReconciliationDriftType.WRONG_PRICE_ID);
  });

  it('detects missing local invoice projection', async () => {
    stripeMock.invoices.list.mockResolvedValue({
      data: [
        {
          id: 'in_missing',
          status: 'paid',
          amount_paid: 4200,
          payment_intent: 'pi_missing',
        },
      ],
    });

    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });
    expect(result.drifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.MISSING_LOCAL_INVOICE,
          stripeValue: 'in_missing',
          autoFixable: true,
        }),
      ]),
    );
  });

  it('detects unknown stripe subscription for organization', async () => {
    subscriptions[0].stripeSubscriptionId = null;
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        {
          ...matchedStripeSubscription,
          id: 'sub_orphan',
          metadata: {
            organizationId: orgId,
            synqdriveSubscriptionId: 'other-sub',
          },
        },
      ],
    });

    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });
    expect(result.drifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.STRIPE_SUBSCRIPTION_WITHOUT_LOCAL,
          stripeValue: 'sub_orphan',
        }),
      ]),
    );
  });

  it('retries stripe calls before failing a subscription', async () => {
    stripeMock.subscriptions.retrieve
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(matchedStripeSubscription);

    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });
    expect(result.errorCount).toBe(0);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledTimes(2);
  });

  it('marks batch partial when one subscription reconciliation fails', async () => {
    subscriptions.push({
      id: 'sub-batch-2',
      organizationId: orgId,
      status: BillingStatus.ACTIVE,
      stripeSubscriptionId: 'sub_stripe_2',
      stripeCustomerId: 'cus_2',
      stripeMode: BillingStripeMode.TEST,
      billingAnchorDay: 1,
      items: [],
      discounts: [],
      invoices: [],
    });

    stripeMock.subscriptions.retrieve.mockImplementation(async (id: string) => {
      if (id === 'sub_stripe_2') {
        throw new Error('provider_down');
      }
      return matchedStripeSubscription;
    });

    const result = await service.runBatch({ organizationId: orgId, batchSize: 10 });
    expect(result.scanned).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.status).toBe(BillingReconciliationRunStatus.PARTIAL);
  });

  it('deduplicates open drift records by idempotency key', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      ...matchedStripeSubscription,
      items: {
        data: [{ ...matchedStripeSubscription.items.data[0], quantity: 9 }],
      },
    });

    await service.runBatch({ organizationId: orgId, batchSize: 10 });
    await service.runBatch({ organizationId: orgId, batchSize: 10 });

    expect(drifts).toHaveLength(1);
  });
});
