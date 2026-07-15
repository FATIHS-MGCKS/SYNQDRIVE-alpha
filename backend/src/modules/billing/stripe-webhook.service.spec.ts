import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookEventStatus } from '@prisma/client';
import { StripeWebhookService } from './stripe-webhook.service';
import * as stripeClientUtil from './stripe-client.util';

describe('StripeWebhookService', () => {
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

  let service: StripeWebhookService;

  const stripeMock = {
    webhooks: {
      constructEvent: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
    },
  };

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

  it('rejects invalid webhook signature', () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found');
    });

    expect(() =>
      service.constructEvent(Buffer.from('{}'), 'bad-signature'),
    ).toThrow(BadRequestException);
  });

  it('skips duplicate processed webhook events', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'invoice.paid',
      data: { object: {} },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({
      stripeEventId: 'evt_dup',
      status: StripeWebhookEventStatus.PROCESSED,
    });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.duplicate).toBe(true);
    expect(prisma.stripeWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('stores and processes invoice.paid webhook', async () => {
    const invoice = {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      status: 'paid',
    };
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'invoice.paid',
      data: { object: invoice },
    });
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.stripeWebhookEvent.create.mockResolvedValue({});
    prisma.stripeWebhookEvent.update.mockResolvedValue({});
    stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue('org-1');
    stripeMock.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' });

    const result = await service.ingestRawWebhook(Buffer.from('{}'), 'sig');
    expect(result.status).toBe('processed');
    expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalledWith(invoice);
    expect(stripeAdapter.applyStripeSubscription).toHaveBeenCalled();
  });
});
