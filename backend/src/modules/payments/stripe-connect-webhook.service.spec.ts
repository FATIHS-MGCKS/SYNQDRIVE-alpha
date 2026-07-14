import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StripeConnectWebhookProcessingStatus } from '@prisma/client';
import { StripeConnectWebhookService } from './stripe-connect-webhook.service';
import { StripeConnectWebhookProcessorService } from './stripe-connect-webhook.processor';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { StripeModeMismatchError } from './stripe/stripe-connect.errors';
import * as clientUtil from './stripe/stripe-connect-client.util';

describe('StripeConnectWebhookService', () => {
  const webhookEventRepository = {
    findByStripeEventId: jest.fn(),
    create: jest.fn(),
  };

  const organizationPaymentAccountRepository = {
    findByStripeConnectedAccountId: jest.fn(),
  };

  const processorService = {
    enqueueForProcessing: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'stripe.connectWebhookSecret') return 'whsec_connect_test';
      if (key === 'stripe.secretKey') return 'sk_test_connect';
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
    });
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

  it('verifies signature against connect webhook secret', async () => {
    const rawBody = Buffer.from('{"id":"evt_connect_1"}');
    await service.ingestRawWebhook(rawBody, 'sig_test');
    expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(
      rawBody,
      'sig_test',
      'whsec_connect_test',
    );
  });

  it('skips duplicate events with 2xx semantics', async () => {
    webhookEventRepository.findByStripeEventId.mockResolvedValue({
      stripeEventId: 'evt_connect_1',
      organizationId: 'org-1',
    });
    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('skipped_duplicate');
    expect(webhookEventRepository.create).not.toHaveBeenCalled();
  });

  it('stores resolved account events durably', async () => {
    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.status).toBe('stored');
    expect(webhookEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: 'evt_connect_1',
        organizationId: 'org-1',
        stripeConnectedAccountId: 'acct_known',
        processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
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
      });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.duplicate).toBe(true);
  });
});
