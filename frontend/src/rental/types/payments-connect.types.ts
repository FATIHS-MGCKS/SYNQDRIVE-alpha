export type ConnectOnboardingStatus =
  | 'PENDING'
  | 'ONBOARDING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'DISABLED'
  | 'REJECTED';

export interface ConnectStatusDto {
  onboardingStatus: ConnectOnboardingStatus;
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

export interface ConnectOnboardingLinkDto {
  url: string;
  expiresAt: string;
}

export type CustomerPaymentsUiState =
  | 'NOT_STARTED'
  | 'ONBOARDING'
  | 'RESTRICTED'
  | 'ACTIVE'
  | 'DISABLED'
  | 'FEATURE_DISABLED'
  | 'NO_ACCESS';

export type PaymentsConnectErrorCode =
  | 'PAYMENTS_FEATURE_DISABLED'
  | 'CONNECT_ACCOUNT_ALREADY_EXISTS'
  | 'CONNECT_NOT_CONFIGURED'
  | 'CONNECT_ACCOUNT_RESTRICTED'
  | 'STRIPE_MODE_MISMATCH'
  | 'CONNECT_PROVIDER_ERROR';
