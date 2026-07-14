import { PaymentConnectReconciliationService } from './payment-connect-reconciliation.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { PaymentStatusService } from './payment-status.service';
import { PaymentMetricsService } from './observability/payment-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StripeConnectWebhookProcessingStatus } from '@prisma/client';

describe('PaymentConnectReconciliationService', () => {
  const prisma = {
    paymentEmailOutbox: { count: jest.fn().mockResolvedValue(0) },
    bookingPaymentRequest: { findMany: jest.fn().mockResolvedValue([]) },
    organizationPaymentAccount: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    paymentTransaction: { findFirst: jest.fn() },
    booking: { findMany: jest.fn().mockResolvedValue([]) },
    stripeConnectWebhookEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const webhookEventRepository = {
    countByProcessingStatus: jest.fn().mockResolvedValue([
      { processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED, count: 0 },
    ]),
    findPendingForReconciliation: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };

  const paymentMetrics = {
    connectWebhookBacklog: { set: jest.fn() },
    paymentEmailDeadLetter: { set: jest.fn() },
    webhookProcessing: { inc: jest.fn() },
    reconciliationMismatch: { inc: jest.fn() },
  };

  const stripeAdapter = {
    getConnectedAccountStatus: jest.fn(),
    getSafePayoutSummary: jest.fn(),
    retrievePaymentIntent: jest.fn(),
  };

  let service: PaymentConnectReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentConnectReconciliationService(
      prisma as unknown as PrismaService,
      {} as PaymentReconciliationService,
      webhookEventRepository as unknown as StripeConnectWebhookEventRepository,
      { buildStatusUpdate: jest.fn().mockReturnValue({}) } as unknown as OrganizationPaymentAccountService,
      {} as OrganizationPaymentAccountRepository,
      {} as PaymentStatusService,
      paymentMetrics as unknown as PaymentMetricsService,
      stripeAdapter as never,
    );
  });

  it('runs periodic reconciliation without errors on empty dataset', async () => {
    const result = await service.runPeriodicReconciliation();
    expect(result.webhooksReprocessed).toBe(0);
    expect(result.alerts).toEqual([]);
    expect(paymentMetrics.connectWebhookBacklog.set).toHaveBeenCalled();
  });
});
