import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StripeConnectWebhookProcessingStatus } from '@prisma/client';
import { StripeConnectWebhookService } from './stripe-connect-webhook.service';
import { StripeConnectWebhookProcessorService } from './stripe-connect-webhook.processor';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { StripeModeMismatchError } from './stripe/stripe-connect.errors';
import { PaymentMetricsService } from './observability/payment-metrics.service';
import * as clientUtil from './stripe/stripe-connect-client.util';

const EMPTY_BODY_HASH = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

describe('StripeConnectWebhookService', () => {
  const webhookEventRepository = {
    findByStripeEventId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const organizationPaymentAccountRepository = {
    findByStripeConnectedAccountId: jest.fn(),
  };

  const processorService = {
    enqueueForProcessing: jest.fn().mockResolvedValue(undefined),
  };

  const paymentMetrics = {
    unknownConnectedAccount: { inc: jest.fn() },
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'stripe.connectWebhookSecret') return 'whsec_connect_test';
      if (key === 'stripe.secretKey') return 'sk_test_connect';
      if (key === 'stripe.webhookToleranceSeconds') return 300;
      return undefined;
    }),
  } as unknown as ConfigService;

  const stripeMock = {
    webhooks: {
      constructEvent: jest.fn(),
    },
  };

  let service: StripeConnectWebhookService;

  const baseEvent = {
    id: 'evt_connect_1',
    type: 'checkout.session.completed',
    livemode: false,
    account: 'acct_known',
    data: {
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        amount_total: 59_500,
        currency: 'eur',
        metadata: { organizationId: 'org-1', paymentRequestId: 'pr-1' },
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeConnectWebhookService(
      configService,
      webhookEventRepository as unknown as StripeConnectWebhookEventRepository,
      organizationPaymentAccountRepository as unknown as OrganizationPaymentAccountRepository,
      processorService as unknown as StripeConnectWebhookProcessorService,
      paymentMetrics as unknown as PaymentMetricsService,
    );
    jest.spyOn(clientUtil, 'getStripeConnectClient').mockReturnValue(stripeMock as never);
    stripeMock.webhooks.constructEvent.mockReturnValue(baseEvent);
    webhookEventRepository.findByStripeEventId.mockResolvedValue(null);
    organizationPaymentAccountRepository.findByStripeConnectedAccountId.mockResolvedValue({
      organizationId: 'org-1',
      stripeConnectedAccountId: 'acct_known',
    });
    webhookEventRepository.create.mockResolvedValue({
      id: 'row-1',
      stripeEventId: 'evt_connect_1',
      eventType: 'checkout.session.completed',
      organizationId: 'org-1',
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      attempts: 0,
    });
    processorService.enqueueForProcessing.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects invalid webhook signature', () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found');
    });
    expect(() =>
      service.constructEvent(Buffer.from('{}'), 'bad-signature'),
    ).toThrow(BadRequestException);
  });

  it('verifies signature against connect webhook secret with tolerance', async () => {
    const rawBody = Buffer.from('{"id":"evt_connect_1"}');
    await service.ingestRawWebhook(rawBody, 'sig_test');
    expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(
      rawBody,
      'sig_test',
      'whsec_connect_test',
      300,
    );
  });

  it('skips terminal processed events with 2xx semantics', async () => {
    webhookEventRepository.findByStripeEventId.mockResolvedValue({
      stripeEventId: 'evt_connect_1',
      organizationId: 'org-1',
      processingStatus: StripeConnectWebhookProcessingStatus.PROCESSED,
      payloadHash: EMPTY_BODY_HASH,
    });
    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('skipped_duplicate');
    expect(webhookEventRepository.create).not.toHaveBeenCalled();
  });

  it('retries failed events instead of skipping them', async () => {
    webhookEventRepository.findByStripeEventId.mockResolvedValue({
      id: 'row-failed',
      stripeEventId: 'evt_connect_1',
      organizationId: 'org-1',
      processingStatus: StripeConnectWebhookProcessingStatus.FAILED,
      payloadHash: EMPTY_BODY_HASH,
      attempts: 1,
    });
    webhookEventRepository.update.mockResolvedValue({
      id: 'row-failed',
      stripeEventId: 'evt_connect_1',
      organizationId: 'org-1',
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      attempts: 2,
    });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(webhookEventRepository.update).toHaveBeenCalled();
    expect(processorService.enqueueForProcessing).toHaveBeenCalled();
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('processed');
  });

  it('stores resolved account events durably and processes inline', async () => {
    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.status).toBe('processed');
    expect(webhookEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: 'evt_connect_1',
        organizationId: 'org-1',
        stripeConnectedAccountId: 'acct_known',
        processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
        payloadHash: EMPTY_BODY_HASH,
      }),
    );
    expect(processorService.enqueueForProcessing).toHaveBeenCalled();
  });

  it('stores unknown account as UNRESOLVED_ACCOUNT without org mapping', async () => {
    organizationPaymentAccountRepository.findByStripeConnectedAccountId.mockResolvedValue(null);
    webhookEventRepository.create.mockResolvedValue({
      id: 'row-2',
      stripeEventId: 'evt_connect_1',
      processingStatus: StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT,
    });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.status).toBe('unresolved_account');
    expect(result.organizationId).toBeNull();
    expect(webhookEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        processingStatus: StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT,
      }),
    );
    expect(processorService.enqueueForProcessing).not.toHaveBeenCalled();
  });

  it('rejects test/live mode mismatch', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      ...baseEvent,
      livemode: true,
    });
    await expect(service.ingestRawWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      StripeModeMismatchError,
    );
  });

  it('returns retryable error on DB failure', async () => {
    webhookEventRepository.create.mockRejectedValue(new Error('db unavailable'));
    await expect(service.ingestRawWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('stores non-MVP events as IGNORED without enqueue', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      ...baseEvent,
      type: 'customer.created',
    });
    webhookEventRepository.create.mockResolvedValue({
      id: 'row-3',
      stripeEventId: 'evt_connect_1',
      eventType: 'customer.created',
      processingStatus: StripeConnectWebhookProcessingStatus.IGNORED,
    });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.status).toBe('ignored_event_type');
    expect(webhookEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        processingStatus: StripeConnectWebhookProcessingStatus.IGNORED,
      }),
    );
    expect(processorService.enqueueForProcessing).not.toHaveBeenCalled();
  });

  it('propagates processor failures so Stripe can retry', async () => {
    processorService.enqueueForProcessing.mockRejectedValue(new Error('reconcile failed'));
    await expect(service.ingestRawWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(
      'reconcile failed',
    );
  });

  it('handles create race via unique stripeEventId', async () => {
    webhookEventRepository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    webhookEventRepository.findByStripeEventId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        stripeEventId: 'evt_connect_1',
        organizationId: 'org-1',
        processingStatus: StripeConnectWebhookProcessingStatus.PROCESSED,
        payloadHash: EMPTY_BODY_HASH,
      });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('skipped_duplicate');
  });
});
