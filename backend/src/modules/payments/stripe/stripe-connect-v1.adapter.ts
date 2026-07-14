import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeAccountGeneration } from '@prisma/client';
import Stripe from 'stripe';
import type { StripeConnectAdapter } from './stripe-connect.adapter';
import {
  ConnectNotConfiguredError,
  ConnectProviderError,
} from './stripe-connect.errors';
import {
  assertConnectTestModeOnly,
  getStripeConnectClient,
} from './stripe-connect-client.util';
import {
  extractSafeBankLast4,
  mapStripeAccountToConnectedStatus,
} from './stripe-account.mapper';
import type {
  ConnectedAccountRef,
  ConnectedAccountStatus,
  CheckoutSessionRef,
  CreateCheckoutSessionInput,
  CreateConnectedAccountInput,
  CreateOnboardingSessionInput,
  CreateRefundInput,
  OnboardingSessionRef,
  RefundRef,
  SafePayoutSummary,
} from './stripe-connect.types';

/**
 * Accounts v1 Connect adapter — Express accounts with Direct Charges architecture.
 * Controller: connected account pays Stripe fees; platform collects application_fee_amount.
 * Verified baseline: Prompt 4 (v1 Account shape; v2 pending Dashboard enablement).
 */
@Injectable()
export class StripeConnectV1Adapter implements StripeConnectAdapter {
  private readonly logger = new Logger(StripeConnectV1Adapter.name);

  constructor(private readonly configService: ConfigService) {}

  private requireStripe(): Stripe {
    const secretKey = this.configService.get<string>('stripe.secretKey') ?? '';
    if (!secretKey) {
      throw new ConnectNotConfiguredError('STRIPE_SECRET_KEY is not configured');
    }
    assertConnectTestModeOnly(secretKey);
    const client = getStripeConnectClient(secretKey);
    if (!client) {
      throw new ConnectNotConfiguredError('Stripe Connect client unavailable');
    }
    return client;
  }

  private livemode(): boolean {
    const secretKey = this.configService.get<string>('stripe.secretKey') ?? '';
    return secretKey.startsWith('sk_live_');
  }

  async createConnectedAccount(input: CreateConnectedAccountInput): Promise<ConnectedAccountRef> {
    const stripe = this.requireStripe();
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: input.country.toUpperCase(),
        email: input.email,
        business_profile: {
          name: input.companyName,
        },
        capabilities: {
          card_payments: { requested: true },
        },
        metadata: {
          synqdrive_organization_id: input.organizationId,
        },
        default_currency: input.defaultCurrency.toLowerCase(),
      });

      return {
        connectedAccountId: account.id,
        livemode: this.livemode(),
        generation: StripeAccountGeneration.V1,
      };
    } catch (error) {
      this.logger.warn(`Stripe createConnectedAccount failed: ${(error as Error).message}`);
      throw new ConnectProviderError(
        error instanceof Error ? error.message : 'Stripe account creation failed',
      );
    }
  }

  async getConnectedAccountStatus(connectedAccountId: string): Promise<ConnectedAccountStatus> {
    const stripe = this.requireStripe();
    try {
      const account = await stripe.accounts.retrieve(connectedAccountId);
      return mapStripeAccountToConnectedStatus(account, this.livemode());
    } catch (error) {
      throw new ConnectProviderError(
        error instanceof Error ? error.message : 'Stripe account retrieve failed',
      );
    }
  }

  async createOnboardingSession(
    input: CreateOnboardingSessionInput,
  ): Promise<OnboardingSessionRef> {
    const stripe = this.requireStripe();
    try {
      const link = await stripe.accountLinks.create({
        account: input.connectedAccountId,
        return_url: input.returnUrl,
        refresh_url: input.refreshUrl,
        type: 'account_onboarding',
      });
      if (!link.url) {
        throw new ConnectProviderError('Stripe did not return an onboarding URL');
      }
      return {
        url: link.url,
        expiresAt: new Date((link.expires_at ?? 0) * 1000),
      };
    } catch (error) {
      if (error instanceof ConnectProviderError) throw error;
      throw new ConnectProviderError(
        error instanceof Error ? error.message : 'Stripe onboarding session failed',
      );
    }
  }

  /**
   * Direct Charge on connected account — platform fee via application_fee_amount.
   * Verified architecture: Prompt 4 Direct Charges + Checkout Sessions.
   */
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionRef> {
    const stripe = this.requireStripe();
    const currency = input.currency.toLowerCase();
    const expiresAtUnix = Math.floor(input.expiresAt.getTime() / 1000);

    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: input.customerEmail,
          line_items: input.lineItems.map((item) => ({
            quantity: item.quantity,
            price_data: {
              currency,
              unit_amount: item.amountCents,
              product_data: {
                name: item.name,
              },
            },
          })),
          payment_intent_data: {
            application_fee_amount: input.applicationFeeAmountCents,
            metadata: {
              organizationId: input.metadata.organizationId,
              bookingId: input.metadata.bookingId,
              invoiceId: input.metadata.invoiceId,
              paymentRequestId: input.metadata.paymentRequestId,
            },
          },
          metadata: {
            organizationId: input.metadata.organizationId,
            bookingId: input.metadata.bookingId,
            invoiceId: input.metadata.invoiceId,
            paymentRequestId: input.metadata.paymentRequestId,
          },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: expiresAtUnix,
        },
        {
          stripeAccount: input.connectedAccountId,
          idempotencyKey: input.stripeIdempotencyKey,
        },
      );

      if (!session.url) {
        throw new ConnectProviderError('Stripe did not return a checkout URL');
      }

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      return {
        sessionId: session.id,
        url: session.url,
        expiresAt: new Date((session.expires_at ?? expiresAtUnix) * 1000),
        paymentIntentId,
        livemode: session.livemode,
      };
    } catch (error) {
      if (error instanceof ConnectProviderError) throw error;
      this.logger.warn(`Stripe createCheckoutSession failed: ${(error as Error).message}`);
      throw new ConnectProviderError(
        error instanceof Error ? error.message : 'Stripe checkout session creation failed',
      );
    }
  }

  /**
   * Direct Charge refund on connected account — optional proportional application_fee refund.
   */
  async createRefund(input: CreateRefundInput): Promise<RefundRef> {
    const stripe = this.requireStripe();
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          ...(input.chargeId ? { charge: input.chargeId } : {}),
          ...(input.amountCents != null ? { amount: input.amountCents } : {}),
          refund_application_fee: input.refundApplicationFee,
          ...(input.reason ? { reason: input.reason as Stripe.RefundCreateParams.Reason } : {}),
        },
        {
          stripeAccount: input.connectedAccountId,
          idempotencyKey: input.stripeIdempotencyKey,
        },
      );

      return {
        refundId: refund.id,
        amountCents: refund.amount,
        currency: (refund.currency ?? 'eur').toUpperCase(),
        status: refund.status ?? 'pending',
        livemode: this.livemode(),
      };
    } catch (error) {
      if (error instanceof ConnectProviderError) throw error;
      this.logger.warn(`Stripe createRefund failed: ${(error as Error).message}`);
      throw new ConnectProviderError(
        error instanceof Error ? error.message : 'Stripe refund creation failed',
      );
    }
  }

  async refreshConnectedAccount(connectedAccountId: string): Promise<ConnectedAccountStatus> {
    return this.getConnectedAccountStatus(connectedAccountId);
  }

  async getSafePayoutSummary(connectedAccountId: string): Promise<SafePayoutSummary> {
    const stripe = this.requireStripe();
    try {
      const account = await stripe.accounts.retrieve(connectedAccountId);
      const external = await stripe.accounts.listExternalAccounts(connectedAccountId, {
        object: 'bank_account',
        limit: 1,
      });
      return {
        payoutsEnabled: account.payouts_enabled === true,
        bankAccountLast4: extractSafeBankLast4(external),
        defaultCurrency: (account.default_currency ?? 'eur').toUpperCase(),
      };
    } catch (error) {
      throw new ConnectProviderError(
        error instanceof Error ? error.message : 'Stripe payout summary failed',
      );
    }
  }
}
