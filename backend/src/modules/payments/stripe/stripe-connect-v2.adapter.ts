import { Injectable } from '@nestjs/common';
import type { StripeConnectAdapter } from './stripe-connect.adapter';
import { ConnectNotConfiguredError } from './stripe-connect.errors';
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
 * Accounts v2 placeholder — Prompt 4 target architecture pending Dashboard early access.
 * All operations throw CONNECT_NOT_CONFIGURED until v2 is explicitly enabled and implemented.
 */
@Injectable()
export class StripeConnectV2Adapter implements StripeConnectAdapter {
  private notConfigured(): never {
    throw new ConnectNotConfiguredError(
      'Stripe Accounts v2 Connect adapter is not enabled. Use STRIPE_CONNECT_ACCOUNT_GENERATION=V1.',
    );
  }

  createConnectedAccount(_input: CreateConnectedAccountInput): Promise<ConnectedAccountRef> {
    return Promise.reject(this.notConfigured());
  }

  getConnectedAccountStatus(_connectedAccountId: string): Promise<ConnectedAccountStatus> {
    return Promise.reject(this.notConfigured());
  }

  createOnboardingSession(_input: CreateOnboardingSessionInput): Promise<OnboardingSessionRef> {
    return Promise.reject(this.notConfigured());
  }

  createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSessionRef> {
    return Promise.reject(this.notConfigured());
  }

  createRefund(_input: CreateRefundInput): Promise<RefundRef> {
    return Promise.reject(this.notConfigured());
  }

  refreshConnectedAccount(_connectedAccountId: string): Promise<ConnectedAccountStatus> {
    return Promise.reject(this.notConfigured());
  }

  getSafePayoutSummary(_connectedAccountId: string): Promise<SafePayoutSummary> {
    return Promise.reject(this.notConfigured());
  }
}
