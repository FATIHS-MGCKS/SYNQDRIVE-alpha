import type { TenantPaymentMethodDto } from '../../types/billing.types';

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

export function paymentMethodNeedsAttention(method: TenantPaymentMethodDto): boolean {
  return method.billingState === 'FAILED' || method.billingState === 'REQUIRES_ACTION';
}

export function hasAnyPaymentMethodProblem(methods: TenantPaymentMethodDto[]): boolean {
  return methods.some(paymentMethodNeedsAttention);
}
