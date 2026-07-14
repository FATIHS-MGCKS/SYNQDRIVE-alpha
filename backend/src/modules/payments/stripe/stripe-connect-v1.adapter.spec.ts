import { ConfigService } from '@nestjs/config';
import { StripeAccountGeneration } from '@prisma/client';
import { StripeConnectV1Adapter } from './stripe-connect-v1.adapter';
import { ConnectNotConfiguredError, StripeModeMismatchError } from './stripe-connect.errors';
import * as clientUtil from './stripe-connect-client.util';

describe('StripeConnectV1Adapter', () => {
  const stripeMock = {
    accounts: {
      create: jest.fn(),
      retrieve: jest.fn(),
      listExternalAccounts: jest.fn(),
    },
    accountLinks: {
      create: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'stripe.secretKey') return 'sk_test_connect';
      return undefined;
    }),
  };

  let adapter: StripeConnectV1Adapter;

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'stripe.secretKey') return 'sk_test_connect';
      return undefined;
    });
    jest.spyOn(clientUtil, 'getStripeConnectClient').mockReturnValue(stripeMock as never);
    adapter = new StripeConnectV1Adapter(configService as unknown as ConfigService);
  });

  afterEach(() => {
    clientUtil.resetStripeConnectClientForTests();
    jest.restoreAllMocks();
  });

  it('creates express connected account with card_payments and transfers capabilities', async () => {
    stripeMock.accounts.create.mockResolvedValue({ id: 'acct_new' });
    const ref = await adapter.createConnectedAccount({
      organizationId: 'org-1',
      country: 'DE',
      email: 'ops@rental.example',
      defaultCurrency: 'EUR',
      companyName: 'Rental GmbH',
    });
    expect(ref.connectedAccountId).toBe('acct_new');
    expect(ref.generation).toBe(StripeAccountGeneration.V1);
    expect(stripeMock.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        country: 'DE',
        metadata: { synqdrive_organization_id: 'org-1' },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      }),
    );
  });

  it('rejects live mode secret key', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === 'stripe.secretKey' ? 'sk_live_secret' : undefined,
    );
    adapter = new StripeConnectV1Adapter(configService as unknown as ConfigService);
    await expect(
      adapter.createConnectedAccount({
        organizationId: 'org-1',
        country: 'DE',
        email: 'ops@rental.example',
        defaultCurrency: 'EUR',
        companyName: 'Rental GmbH',
      }),
    ).rejects.toBeInstanceOf(StripeModeMismatchError);
  });

  it('throws CONNECT_NOT_CONFIGURED without secret key', async () => {
    (configService.get as jest.Mock).mockReturnValue('');
    adapter = new StripeConnectV1Adapter(configService as unknown as ConfigService);
    await expect(
      adapter.getConnectedAccountStatus('acct_x'),
    ).rejects.toBeInstanceOf(ConnectNotConfiguredError);
  });

  it('creates onboarding session via account links', async () => {
    stripeMock.accountLinks.create.mockResolvedValue({
      url: 'https://connect.stripe.com/onboard',
      expires_at: 1_700_000_000,
    });
    const session = await adapter.createOnboardingSession({
      connectedAccountId: 'acct_1',
      returnUrl: 'https://app.example/return',
      refreshUrl: 'https://app.example/refresh',
    });
    expect(session.url).toContain('stripe.com');
    expect(session.expiresAt).toBeInstanceOf(Date);
  });

  it('creates checkout session on connected account with application fee', async () => {
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.test/cs_test_1',
      expires_at: 1_700_000_000,
      payment_intent: 'pi_test_1',
      livemode: false,
    });

    const session = await adapter.createCheckoutSession({
      connectedAccountId: 'acct_connected',
      currency: 'EUR',
      lineItems: [{ name: 'Miete', amountCents: 59_500, quantity: 1 }],
      applicationFeeAmountCents: 1_488,
      customerEmail: 'customer@example.com',
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      expiresAt: new Date(1_700_000_000 * 1000),
      metadata: {
        organizationId: 'org-1',
        bookingId: 'booking-1',
        invoiceId: 'inv-1',
        paymentRequestId: 'pr-1',
      },
      stripeIdempotencyKey: 'checkout:org-1:pr-1:idem',
    });

    expect(session.sessionId).toBe('cs_test_1');
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_intent_data: expect.objectContaining({
          application_fee_amount: 1_488,
          metadata: expect.objectContaining({ paymentRequestId: 'pr-1' }),
        }),
      }),
      expect.objectContaining({
        stripeAccount: 'acct_connected',
        idempotencyKey: 'checkout:org-1:pr-1:idem',
      }),
    );
  });
});
