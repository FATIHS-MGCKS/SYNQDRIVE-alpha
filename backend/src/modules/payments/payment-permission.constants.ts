import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Canonical end-customer payment permission actions.
 * Mapped to existing `{ module, read|write|manage }` membership JSON — separate from `billing`.
 */
export const PAYMENT_PERMISSION_ACTIONS = [
  'payments.read',
  'payments.create',
  'payments.resend',
  'payments.cancel',
  'payments.refund',
  'payments.disputes.read',
  'payments.connect.read',
  'payments.connect.manage',
  'payments.settings.manage',
] as const;

export type PaymentPermissionAction = (typeof PAYMENT_PERMISSION_ACTIONS)[number];

export interface PaymentPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

/** Refunds use a dedicated module — never `billing.write`. */
export const PAYMENT_PERMISSION_REQUIREMENTS: Readonly<
  Record<PaymentPermissionAction, PaymentPermissionRequirement>
> = {
  'payments.read': { module: 'payments', level: 'read' },
  'payments.create': { module: 'payments', level: 'write' },
  'payments.resend': { module: 'payments', level: 'write' },
  'payments.cancel': { module: 'payments', level: 'write' },
  'payments.refund': { module: 'payments-refund', level: 'write' },
  'payments.disputes.read': { module: 'payments-disputes', level: 'read' },
  'payments.connect.read': { module: 'payments-connect', level: 'read' },
  'payments.connect.manage': { module: 'payments-connect', level: 'manage' },
  'payments.settings.manage': { module: 'payments-settings', level: 'manage' },
};

export function isPaymentPermissionAction(value: string): value is PaymentPermissionAction {
  return (PAYMENT_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
