import type { OrganizationPaymentAccount, OrganizationPaymentAccountStatus } from '@prisma/client';
import { parseJsonStringArray } from '../utils/payments-connect-url.util';

export interface ConnectStatusResponse {
  onboardingStatus: OrganizationPaymentAccountStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disabledReason: string | null;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  bankAccountLast4: string | null;
  country: string | null;
  defaultCurrency: string;
  lastSyncedAt: string | null;
}

export interface ConnectOnboardingLinkResponse {
  url: string;
  expiresAt: string;
}

export function mapAccountToConnectStatusResponse(
  account: OrganizationPaymentAccount,
): ConnectStatusResponse {
  return {
    onboardingStatus: account.status,
    detailsSubmitted: account.detailsSubmitted,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    disabledReason: account.disabledReason,
    requirementsCurrentlyDue: parseJsonStringArray(account.requirementsCurrentlyDue),
    requirementsPastDue: parseJsonStringArray(account.requirementsPastDue),
    bankAccountLast4: account.bankAccountLast4,
    country: account.country,
    defaultCurrency: account.defaultCurrency,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
  };
}
