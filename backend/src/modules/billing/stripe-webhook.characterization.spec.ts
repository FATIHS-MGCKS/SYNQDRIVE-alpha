import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookEventStatus } from '@prisma/client';
import { StripeWebhookService } from './stripe-webhook.service';
import * as stripeClientUtil from './stripe-client.util';

describe('StripeWebhookService characterization', () => {
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

  describe('signature verification', () => {
    it('rejects missing stripe-signature header', () => {
      expect(() => service.constructEvent(Buffer.from('{}'), undefined)).toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid webhook signature from Stripe SDK', () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      expect(() => service.constructEvent(Buffer.from('{}'), 'bad-sig')).toThrow(
        BadRequestException,
      );
    });

    it('rejects when webhook secret is not configured', () => {
      const noSecretConfig = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;
      const localService = new StripeWebhookService(
        prisma as never,
        noSecretConfig,
        dispatcher as never,
      );

      expect(() => localService.constructEvent(Buffer.from('{}'), 'sig')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('idempotency and duplicate event IDs', () => {
    it('skips already PROCESSED events without re-dispatching', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_processed',
        type: 'invoice.paid',
        created: 1,
        livemode: false,
        data: { object: {} },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
        stripeEventId: 'evt_processed',
        status: StripeWebhookEventStatus.PROCESSED,
      });

      const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

      expect(result.duplicate).toBe(true);
      expect(result.status).toBe('skipped_processed');
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('re-processes event when prior row exists but is not PROCESSED', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_retry',
        type: 'invoice.paid',
        created: 1,
        livemode: false,
        data: { object: { id: 'in_retry' } },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
        stripeEventId: 'evt_retry',
        status: StripeWebhookEventStatus.RECEIVED,
        retryCount: 0,
      });
      prisma.stripeWebhookEvent.update.mockResolvedValue({});

      const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

      expect(result.duplicate).toBe(false);
      expect(result.status).toBe('processed');
      expect(dispatcher.dispatch).toHaveBeenCalled();
      expect(prisma.stripeWebhookEvent.create).not.toHaveBeenCalled();
    });

    it('creates webhook event row on first ingest', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_new',
        type: 'customer.updated',
        created: 1,
        livemode: false,
        data: { object: { id: 'cus_1' } },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({ retryCount: 0 });
      prisma.stripeWebhookEvent.update.mockResolvedValue({});

      await service.ingestRawWebhook(Buffer.from('payload'), 'sig');

      expect(prisma.stripeWebhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripeEventId: 'evt_new',
            type: 'customer.updated',
            status: StripeWebhookEventStatus.RECEIVED,
          }),
        }),
      );
    });
  });

  describe('event dispatch delegation', () => {
    it('delegates invoice.payment_failed to dispatcher', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_fail',
        type: 'invoice.payment_failed',
        created: 1,
        livemode: false,
        data: { object: { id: 'in_failed' } },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({ retryCount: 0 });
      prisma.stripeWebhookEvent.update.mockResolvedValue({});

      await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

      expect(dispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ event: expect.objectContaining({ type: 'invoice.payment_failed' }) }),
      );
    });

    it('marks unknown event types as IGNORED without dispatch', async () => {
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
      expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: StripeWebhookEventStatus.IGNORED }),
        }),
      );
    });
  });
});
