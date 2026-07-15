import type { TenantPaymentMethodDto } from '../../types/billing.types';

const BILLING_STATE_LABELS: Record<TenantPaymentMethodDto['billingState'], string> = {
  READY: 'Hinterlegt',
  MISSING: 'Nicht hinterlegt',
  REQUIRES_ACTION: 'Bestätigung erforderlich',
  FAILED: 'Ungültig oder abgelaufen',
};

export function paymentMethodBillingStateLabel(
  state: TenantPaymentMethodDto['billingState'],
): string {
  return BILLING_STATE_LABELS[state];
}

export function paymentMethodBillingStateTone(
  state: TenantPaymentMethodDto['billingState'],
): string {
  switch (state) {
    case 'READY':
      return 'sq-tone-success';
    case 'REQUIRES_ACTION':
      return 'sq-tone-warning';
    case 'FAILED':
      return 'sq-tone-critical';
    default:
      return 'sq-tone-neutral';
  }
}

export function formatPaymentMethodDisplay(method: TenantPaymentMethodDto): {
  title: string;
  subtitle: string;
  detail: string | null;
} {
  if (method.type === 'SEPA_DEBIT') {
    const bank = method.bankName ?? 'Bankkonto';
    const last4 = method.last4 ? ` •••• ${method.last4}` : '';
    return {
      title: `${bank}${last4}`,
      subtitle: method.typeLabel,
      detail: method.mandateStatusLabel
        ? `Mandat: ${method.mandateStatusLabel}`
        : null,
    };
  }

  const brand = method.brand ?? 'Karte';
  const last4 = method.last4 ? ` •••• ${method.last4}` : '';
  const expiry =
    method.expMonth && method.expYear
      ? `Gültig bis ${String(method.expMonth).padStart(2, '0')}/${method.expYear}`
      : null;

  return {
    title: `${brand}${last4}`,
    subtitle: method.typeLabel,
    detail: expiry,
  };
}

export function paymentMethodNeedsAttention(method: TenantPaymentMethodDto): boolean {
  return method.billingState === 'FAILED' || method.billingState === 'REQUIRES_ACTION';
}

export function hasAnyPaymentMethodProblem(methods: TenantPaymentMethodDto[]): boolean {
  return methods.some(paymentMethodNeedsAttention);
}
