import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import Stripe from 'stripe';
import {
  mapStripeSubscriptionStatus,
  SubscriptionStatus,
  SyncStatus,
} from '../domain';
import {
  StripeAdapterConfiguration,
  StripeAdapterCustomerResult,
  StripeAdapterPaymentMethodSync,
  StripeAdapterPortalSession,
  StripeAdapterSetupIntent,
  StripeAdapterSyncResult,
} from '../domain/billing-resolver.types';
import { StripeBillingService } from '../stripe-billing.service';

/**
 * Infrastructure adapter — the only billing-layer entry point that touches Stripe SDK types.
 * Callers outside this file must consume domain result types only.
 */
@Injectable()
export class StripeBillingAdapter {
  constructor(private readonly stripeBilling: StripeBillingService) {}

  getConfiguration(): StripeAdapterConfiguration {
    const configured = this.stripeBilling.isStripeConfigured();
    return {
      configured,
      syncStatus: configured ? SyncStatus.SYNCED : SyncStatus.PENDING,
      message: configured
        ? null
        : 'Stripe is not configured. Set STRIPE_SECRET_KEY.',
    };
  }

  async ensureCustomer(organizationId: string): Promise<StripeAdapterCustomerResult> {
    const customerId = await this.stripeBilling.ensureCustomerForOrganization(organizationId);
    return { customerId, organizationId };
  }

  async createCustomerPortalSession(
    organizationId: string,
    returnUrl?: string,
  ): Promise<StripeAdapterPortalSession> {
    const session = await this.stripeBilling.createCustomerPortalSession(organizationId, returnUrl);
    return {
      url: session.url,
      customerId: session.customerId,
      returnUrl: session.returnUrl,
    };
  }

  async createSetupIntent(organizationId: string): Promise<StripeAdapterSetupIntent> {
    const intent = await this.stripeBilling.createSetupIntent(organizationId);
    return {
      clientSecret: intent.clientSecret,
      customerId: intent.customerId,
      setupIntentId: intent.setupIntentId,
    };
  }

  async syncPaymentMethods(organizationId: string): Promise<StripeAdapterPaymentMethodSync> {
    try {
      const result = await this.stripeBilling.syncPaymentMethods(organizationId);
      return {
        syncStatus: SyncStatus.SYNCED,
        synced: result.synced,
        customerId: result.customerId,
        defaultPaymentMethodId: result.defaultPaymentMethodId ?? null,
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_IMPLEMENTED) {
        return {
          syncStatus: SyncStatus.PENDING,
          synced: 0,
          customerId: null,
          defaultPaymentMethodId: null,
        };
      }
      throw error;
    }
  }

  async syncSubscription(organizationId: string): Promise<StripeAdapterSyncResult> {
    try {
      const result = await this.stripeBilling.syncSubscriptionFromStripe(organizationId);
      if (!result.synced) {
        const reason = 'reason' in result ? result.reason : 'Subscription not synced';
        return {
          syncStatus: SyncStatus.PENDING,
          organizationId,
          subscriptionId: null,
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          subscriptionStatus: mapStripeSubscriptionStatus('incomplete').domainStatus,
          message: reason ?? 'Subscription not synced',
        };
      }

      const synced = result as {
        subscriptionId: string;
        stripeSubscriptionId: string;
        status: { domainStatus: SubscriptionStatus };
      };

      return {
        syncStatus: SyncStatus.SYNCED,
        organizationId,
        subscriptionId: synced.subscriptionId ?? null,
        stripeSubscriptionId: synced.stripeSubscriptionId ?? null,
        stripeCustomerId: null,
        subscriptionStatus: synced.status.domainStatus,
        message: null,
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_IMPLEMENTED) {
        return {
          syncStatus: SyncStatus.PENDING,
          organizationId,
          subscriptionId: null,
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          subscriptionStatus: mapStripeSubscriptionStatus('incomplete').domainStatus,
          message: 'Stripe is not configured',
        };
      }
      throw error;
    }
  }

  /**
   * Applies a Stripe subscription payload after webhook or pull sync.
   * Stripe types are confined to this adapter method signature.
   */
  async applyStripeSubscription(
    organizationId: string,
    stripeSub: Stripe.Subscription,
  ): Promise<StripeAdapterSyncResult> {
    const result = await this.stripeBilling.applyStripeSubscription(organizationId, stripeSub);
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer?.id ?? null;

    return {
      syncStatus: SyncStatus.SYNCED,
      organizationId,
      subscriptionId: result.subscriptionId ?? null,
      stripeSubscriptionId: result.stripeSubscriptionId ?? null,
      stripeCustomerId: customerId,
      subscriptionStatus: result.status.domainStatus,
      message: null,
    };
  }

  async createOrUpdateSubscription(organizationId: string): Promise<StripeAdapterSyncResult> {
    const result = await this.stripeBilling.createOrUpdateSubscriptionForOrg(organizationId);

    if ('prepared' in result && result.prepared) {
      return {
        syncStatus: SyncStatus.PENDING,
        organizationId,
        subscriptionId: null,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        subscriptionStatus: mapStripeSubscriptionStatus('incomplete').domainStatus,
        message: result.message ?? 'Stripe subscription not created',
      };
    }

    if (!('subscriptionId' in result)) {
      return {
        syncStatus: SyncStatus.PENDING,
        organizationId,
        subscriptionId: null,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        subscriptionStatus: mapStripeSubscriptionStatus('incomplete').domainStatus,
        message: 'Unexpected Stripe subscription response',
      };
    }

    return {
      syncStatus: SyncStatus.SYNCED,
      organizationId,
      subscriptionId: result.subscriptionId ?? null,
      stripeSubscriptionId: result.stripeSubscriptionId ?? null,
      stripeCustomerId: null,
      subscriptionStatus: result.status?.domainStatus ?? mapStripeSubscriptionStatus('active').domainStatus,
      message: null,
    };
  }
}
