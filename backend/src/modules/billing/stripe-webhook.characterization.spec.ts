import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookEventStatus } from '@prisma/client';
import { StripeWebhookService } from './stripe-webhook.service';
import * as stripeClientUtil from './stripe-client.util';

describe('StripeWebhookService characterization', () => {
  const prisma = {
    stripeWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const stripeAdapter = {
    applyStripeSubscription: jest.fn().mockResolvedValue({ syncStatus: 'SYNCED' }),
    syncPaymentMethods: jest.fn().mockResolvedValue({ syncStatus: 'SYNCED', synced: 0 }),
  };

  const billingEvents = {
    publishSubscriptionSynced: jest.fn().mockResolvedValue(undefined),
  };

  const stripeBilling = {
    findOrganizationIdByStripeCustomer: jest.fn(),
    findOrganizationIdByStripeSubscription: jest.fn(),
    applyStripeSubscription: jest.fn(),
    syncPaymentMethods: jest.fn(),
  };

  const invoiceMirror = {
    mirrorStripeInvoice: jest.fn(),
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
    subscriptions: { retrieve: jest.fn() },
  };

  let service: StripeWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeWebhookService(
      prisma as never,
      configService,
      stripeBilling as never,
      stripeAdapter as never,
      invoiceMirror as never,
      billingEvents as never,
    );
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);
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
        stripeBilling as never,
        stripeAdapter as never,
        invoiceMirror as never,
        billingEvents as never,
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
        data: { object: {} },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
        stripeEventId: 'evt_processed',
        status: StripeWebhookEventStatus.PROCESSED,
      });

      const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

      expect(result.duplicate).toBe(true);
      expect(result.status).toBe('skipped_processed');
      expect(invoiceMirror.mirrorStripeInvoice).not.toHaveBeenCalled();
      expect(prisma.stripeWebhookEvent.update).not.toHaveBeenCalled();
    });

    it('re-processes event when prior row exists but is not PROCESSED', async () => {
      const invoice = { id: 'in_retry', customer: 'cus_1', subscription: 'sub_1', status: 'paid' };
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_retry',
        type: 'invoice.paid',
        data: { object: invoice },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
        stripeEventId: 'evt_retry',
        status: StripeWebhookEventStatus.RECEIVED,
      });
      prisma.stripeWebhookEvent.update.mockResolvedValue({});
      stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue('org-1');
      stripeMock.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' });

      const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

      expect(result.duplicate).toBe(false);
      expect(result.status).toBe('processed');
      expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalledWith(invoice);
      expect(prisma.stripeWebhookEvent.create).not.toHaveBeenCalled();
    });

    it('creates webhook event row on first ingest', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_new',
        type: 'customer.updated',
        data: { object: { id: 'cus_1' } },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({});
      prisma.stripeWebhookEvent.update.mockResolvedValue({});
      stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue('org-1');

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

  describe('event dispatch', () => {
    it('mirrors invoice on invoice.payment_failed and refreshes subscription', async () => {
      const invoice = {
        id: 'in_failed',
        customer: 'cus_1',
        subscription: 'sub_1',
        status: 'open',
      };
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_fail',
        type: 'invoice.payment_failed',
        data: { object: invoice },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({});
      prisma.stripeWebhookEvent.update.mockResolvedValue({});
      stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue('org-1');
      stripeMock.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'past_due' });

      await service.ingestRawWebhook(Buffer.from('{}'), 'sig');

      expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalledWith(invoice);
      expect(stripeAdapter.applyStripeSubscription).toHaveBeenCalled();
      expect(stripeAdapter.syncPaymentMethods).toHaveBeenCalledWith('org-1');
    });

    it('charge.refunded only syncs payment methods — legacy behavior (to be corrected in prompt 25)', () => {
      // Current: refunds are not persisted locally; only payment method sync runs.
      const charge = { id: 'ch_1', customer: 'cus_1' };
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_refund',
        type: 'charge.refunded',
        data: { object: charge },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({});
      prisma.stripeWebhookEvent.update.mockResolvedValue({});
      stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue('org-1');

      return service.ingestRawWebhook(Buffer.from('{}'), 'sig').then((result) => {
        expect(result.status).toBe('processed');
        expect(invoiceMirror.mirrorStripeInvoice).not.toHaveBeenCalled();
        expect(stripeBilling.syncPaymentMethods).toHaveBeenCalledWith('org-1');
      });
    });

    it('marks unknown event types as IGNORED', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        id: 'evt_unknown',
        type: 'account.updated',
        data: { object: {} },
      });
      prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
      prisma.stripeWebhookEvent.create.mockResolvedValue({});
      prisma.stripeWebhookEvent.update.mockResolvedValue({});

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
