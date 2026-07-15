import { BillingPaymentMethodStatus, BillingPaymentMethodType } from '@prisma/client';

export const StripePaymentMethodErrorCode = {
  NOT_CONFIGURED: 'STRIPE_PAYMENT_METHOD_NOT_CONFIGURED',
  PAYMENT_METHOD_NOT_FOUND: 'STRIPE_PAYMENT_METHOD_NOT_FOUND',
  ORGANIZATION_MISMATCH: 'STRIPE_PAYMENT_METHOD_ORGANIZATION_MISMATCH',
  STRIPE_MODE_MISMATCH: 'STRIPE_PAYMENT_METHOD_MODE_MISMATCH',
  RETURN_URL_NOT_ALLOWED: 'STRIPE_PAYMENT_METHOD_RETURN_URL_NOT_ALLOWED',
  PAYMENT_METHOD_INACTIVE: 'STRIPE_PAYMENT_METHOD_INACTIVE',
  DEFAULT_REQUIRED: 'STRIPE_PAYMENT_METHOD_DEFAULT_REQUIRED',
  SETUP_INTENT_ORGANIZATION_MISMATCH: 'STRIPE_SETUP_INTENT_ORGANIZATION_MISMATCH',
} as const;

export type StripePaymentMethodErrorCode =
  (typeof StripePaymentMethodErrorCode)[keyof typeof StripePaymentMethodErrorCode];

export const SUPPORTED_SETUP_PAYMENT_METHOD_TYPES = ['card', 'sepa_debit'] as const;
export type SupportedSetupPaymentMethodType = (typeof SUPPORTED_SETUP_PAYMENT_METHOD_TYPES)[number];

export const BILLING_PAYMENT_METHOD_MISSING_STATE = 'MISSING' as const;

export interface SafePaymentMethodView {
  id: string;
  type: BillingPaymentMethodType;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  country: string | null;
  billingName: string | null;
  sepaMandateStatus: string | null;
  sepaBankCode: string | null;
  isDefault: boolean;
  status: BillingPaymentMethodStatus;
  isActive: boolean;
  billingState: 'READY' | typeof BILLING_PAYMENT_METHOD_MISSING_STATE | 'REQUIRES_ACTION' | 'FAILED';
}

export interface PaymentMethodSyncResult {
  organizationId: string;
  synced: number;
  customerId: string | null;
  defaultPaymentMethodId: string | null;
  stripeMode: string | null;
}

export function mapCardExpiryStatus(
  expMonth: number | null | undefined,
  expYear: number | null | undefined,
  asOf: Date = new Date(),
): BillingPaymentMethodStatus {
  if (!expMonth || !expYear) {
    return BillingPaymentMethodStatus.ACTIVE;
  }
  const expiresAt = new Date(expYear, expMonth, 0, 23, 59, 59, 999);
  return expiresAt < asOf ? BillingPaymentMethodStatus.EXPIRED : BillingPaymentMethodStatus.ACTIVE;
}

export function mapSepaMandateStatusToLocalStatus(
  mandateStatus: string | null | undefined,
): BillingPaymentMethodStatus {
  switch ((mandateStatus ?? '').toLowerCase()) {
    case 'active':
      return BillingPaymentMethodStatus.ACTIVE;
    case 'pending':
      return BillingPaymentMethodStatus.REQUIRES_ACTION;
    case 'inactive':
      return BillingPaymentMethodStatus.FAILED;
    default:
      return BillingPaymentMethodStatus.REQUIRES_ACTION;
  }
}

export function resolveBillingPaymentState(input: {
  exists: boolean;
  status: BillingPaymentMethodStatus | null;
}): SafePaymentMethodView['billingState'] {
  if (!input.exists || !input.status) {
    return BILLING_PAYMENT_METHOD_MISSING_STATE;
  }
  if (input.status === BillingPaymentMethodStatus.ACTIVE) {
    return 'READY';
  }
  if (input.status === BillingPaymentMethodStatus.REQUIRES_ACTION) {
    return 'REQUIRES_ACTION';
  }
  if (input.status === BillingPaymentMethodStatus.FAILED || input.status === BillingPaymentMethodStatus.EXPIRED) {
    return 'FAILED';
  }
  return BILLING_PAYMENT_METHOD_MISSING_STATE;
}

export function toSafePaymentMethodView(row: {
  id: string;
  type: BillingPaymentMethodType;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  country: string | null;
  billingName: string | null;
  sepaMandateStatus: string | null;
  sepaBankCode: string | null;
  isDefault: boolean;
  status: BillingPaymentMethodStatus;
}): SafePaymentMethodView {
  const isActive = row.status === BillingPaymentMethodStatus.ACTIVE;
  return {
    id: row.id,
    type: row.type,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.expMonth,
    expYear: row.expYear,
    country: row.country,
    billingName: row.billingName,
    sepaMandateStatus: row.sepaMandateStatus,
    sepaBankCode: row.sepaBankCode,
    isDefault: row.isDefault,
    status: row.status,
    isActive,
    billingState: resolveBillingPaymentState({ exists: true, status: row.status }),
  };
}

export function assertSetupIntentOrganization(
  metadata: Record<string, string> | null | undefined,
  organizationId: string,
): void {
  const metaOrgId = metadata?.organizationId?.trim();
  if (!metaOrgId || metaOrgId !== organizationId) {
    const error = new Error(StripePaymentMethodErrorCode.SETUP_INTENT_ORGANIZATION_MISMATCH);
    (error as Error & { code: string }).code =
      StripePaymentMethodErrorCode.SETUP_INTENT_ORGANIZATION_MISMATCH;
    throw error;
  }
}
