import type {
  ConnectedAccountRef,
  ConnectedAccountStatus,
  CreateConnectedAccountInput,
  CreateOnboardingSessionInput,
  OnboardingSessionRef,
  SafePayoutSummary,
} from './stripe-connect.types';

export const STRIPE_CONNECT_ADAPTER = Symbol('STRIPE_CONNECT_ADAPTER');

/**
 * Stripe-agnostic Connect port — implementations hide v1/v2 API details.
 * Direct Charges + application_fee_amount architecture (Prompt 4).
 */
export interface StripeConnectAdapter {
  createConnectedAccount(input: CreateConnectedAccountInput): Promise<ConnectedAccountRef>;
  getConnectedAccountStatus(connectedAccountId: string): Promise<ConnectedAccountStatus>;
  createOnboardingSession(input: CreateOnboardingSessionInput): Promise<OnboardingSessionRef>;
  refreshConnectedAccount(connectedAccountId: string): Promise<ConnectedAccountStatus>;
  getSafePayoutSummary(connectedAccountId: string): Promise<SafePayoutSummary>;
}
