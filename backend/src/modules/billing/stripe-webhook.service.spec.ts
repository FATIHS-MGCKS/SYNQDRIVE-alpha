import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StripeWebhookEventStatus } from '@prisma/client';
import { StripeWebhookService } from './stripe-webhook.service';
import * as stripeClientUtil from './stripe-client.util';

describe('StripeWebhookService ingest', () => {
  const dispatcher = {
    resolveOrganizationId: jest.fn(),
    dispatch: jest.fn(),
  };

  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'stripe.webhookSecret') return 'whsec_test';
      if (key === 'stripe.secretKey') return 'sk_test';
      return undefined;
    }),
  } as unknown as ConfigService;

  const stripeMock = {
    webhooks: { constructEvent: jest.fn() },
  };

  let service: StripeWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeWebhookService(prisma as never, configService, dispatcher as never);
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);
    dispatcher.resolveOrganizationId.mockResolvedValue('org-1');
    dispatcher.dispatch.mockResolvedValue({ outcome: 'processed', organizationId: 'org-1' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects invalid webhook signature', () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found');
    });

    expect(() => service.constructEvent(Buffer.from('{}'), 'bad-signature')).toThrow(
      BadRequestException,
    );
  });

  it('stores event before processing and marks processed', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'invoice.paid',
      created: 1_700_000_000,
      livemode: false,
      data: { object: { id: 'in_1', customer: 'cus_1' } },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.create.mockResolvedValue({ retryCount: 0 });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.stripeWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeEventId: 'evt_1',
          status: StripeWebhookEventStatus.RECEIVED,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalled();
    expect(result.status).toBe('processed');
  });

  it('skips duplicate processed webhook events', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'invoice.paid',
      created: 1,
      livemode: false,
      data: { object: {} },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
      stripeEventId: 'evt_dup',
      status: StripeWebhookEventStatus.PROCESSED,
      organizationId: 'org-1',
    });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('skipped_processed');
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('retries failed events by re-dispatching', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_retry',
      type: 'invoice.paid',
      created: 1,
      livemode: false,
      data: { object: { id: 'in_retry' } },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
      stripeEventId: 'evt_retry',
      status: StripeWebhookEventStatus.FAILED,
      retryCount: 1,
    });
    prisma.stripeWebhookEvent.update.mockResolvedValue({ retryCount: 2 });

    await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: 'evt_retry' },
        data: expect.objectContaining({ retryCount: 2 }),
      }),
    );
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('marks unsupported events as ignored after store', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_unknown',
      type: 'account.updated',
      created: 1,
      livemode: false,
      data: { object: {} },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.create.mockResolvedValue({ retryCount: 0 });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(result.status).toBe('ignored');
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('handles create race with unique stripe event id', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_race',
      type: 'invoice.paid',
      created: 1,
      livemode: false,
      data: { object: { id: 'in_race' } },
    });
    prisma.stripeWebhookEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        stripeEventId: 'evt_race',
        status: StripeWebhookEventStatus.RECEIVED,
        retryCount: 0,
      });
    prisma.stripeWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.stripeWebhookEvent.update.mockResolvedValue({ retryCount: 1 });

    await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('marks unresolved mapping from dispatcher', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_unresolved',
      type: 'customer.subscription.updated',
      created: 1,
      livemode: false,
      data: { object: { id: 'sub_x' } },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.create.mockResolvedValue({ retryCount: 0 });
    dispatcher.dispatch.mockResolvedValue({
      outcome: 'unresolved_mapping',
      organizationId: null,
      message: 'No organization mapping',
    });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

    expect(result.status).toBe('unresolved_mapping');
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StripeWebhookEventStatus.UNRESOLVED_MAPPING,
        }),
      }),
    );
  });

  it('marks failed processing and rethrows for Stripe retry', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_fail',
      type: 'invoice.paid',
      created: 1,
      livemode: false,
      data: { object: { id: 'in_fail' } },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.create.mockResolvedValue({ retryCount: 0 });
    dispatcher.dispatch.mockRejectedValue(new Error('db unavailable'));

    await expect(service.ingestRawWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(
      'db unavailable',
    );
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: StripeWebhookEventStatus.FAILED }),
      }),
    );
  });
});
