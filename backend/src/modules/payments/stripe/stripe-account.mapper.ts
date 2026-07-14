import { OrganizationPaymentAccountStatus } from '@prisma/client';
import type Stripe from 'stripe';
import type { ConnectedAccountStatus } from './stripe-connect.types';

function requirementsList(
  requirements: Stripe.Account.Requirements | null | undefined,
  key: 'currently_due' | 'past_due' | 'pending_verification',
): string[] {
  const value = requirements?.[key];
  return Array.isArray(value) ? [...value] : [];
}

export function mapStripeAccountToConnectedStatus(
  account: Stripe.Account,
  livemode: boolean,
): ConnectedAccountStatus {
  const disabledReason = account.requirements?.disabled_reason ?? null;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;

  let status: OrganizationPaymentAccountStatus = OrganizationPaymentAccountStatus.PENDING;
  if (disabledReason === 'rejected.fraud' || disabledReason === 'rejected.listed') {
    status = OrganizationPaymentAccountStatus.REJECTED;
  } else if (disabledReason) {
    status = OrganizationPaymentAccountStatus.DISABLED;
  } else if (!detailsSubmitted) {
    status = OrganizationPaymentAccountStatus.ONBOARDING;
  } else if (chargesEnabled && payoutsEnabled) {
    status = OrganizationPaymentAccountStatus.ACTIVE;
  } else if (
    requirementsList(account.requirements, 'currently_due').length > 0
    || requirementsList(account.requirements, 'past_due').length > 0
  ) {
    status = OrganizationPaymentAccountStatus.RESTRICTED;
  } else if (detailsSubmitted && chargesEnabled) {
    status = OrganizationPaymentAccountStatus.ACTIVE;
  }

  return {
    status,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    disabledReason,
    requirements: {
      currentlyDue: requirementsList(account.requirements, 'currently_due'),
      pastDue: requirementsList(account.requirements, 'past_due'),
      pendingVerification: requirementsList(account.requirements, 'pending_verification'),
    },
    country: account.country ?? null,
    defaultCurrency: (account.default_currency ?? 'eur').toUpperCase(),
    livemode,
  };
}

export function extractSafeBankLast4(
  externalAccounts: Stripe.ApiList<Stripe.BankAccount | Stripe.Card>,
): string | null {
  const bank = externalAccounts.data.find((item) => item.object === 'bank_account') as
    | Stripe.BankAccount
    | undefined;
  return bank?.last4 ?? null;
}
