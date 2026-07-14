import { SetMetadata } from '@nestjs/common';
import type { PaymentPermissionAction } from '../payment-permission.constants';

export const PAYMENT_PERMISSION_KEY = 'required_payment_permission';

/**
 * Declarative payment capability for org-scoped payment routes.
 * Enforced by `PaymentsPermissionGuard` after `PaymentsFeatureGuard`.
 */
export const RequirePaymentPermission = (action: PaymentPermissionAction) =>
  SetMetadata(PAYMENT_PERMISSION_KEY, action);
