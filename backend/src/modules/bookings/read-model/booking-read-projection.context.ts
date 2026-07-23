import { MembershipRole } from '@prisma/client';
import {
  evaluateModulePermission,
  type MembershipPermissionsMap,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS } from '../booking-eligibility-permission.constants';
import { BOOKING_SIGNATURE_PERMISSION_REQUIREMENTS } from '../signature/booking-handover-signature-permission.constants';

export interface BookingReadProjectionContext {
  actorUserId: string | null;
  membershipRole: MembershipRole | undefined;
  platformRole: string | undefined;
  permissions: MembershipPermissionsMap | null;
  /** When set, responses must not leak other customers' scoped data. */
  customerScopeId: string | null;
  canViewCustomerPii: boolean;
  canViewFinance: boolean;
  canViewPayments: boolean;
  canViewPaymentProviderRefs: boolean;
  canViewAudit: boolean;
  canViewRentalEligibility: boolean;
  canViewSignatureReferences: boolean;
}

export function resolveBookingReadProjectionContext(input: {
  actor?: PermissionActor | null;
  permissions?: MembershipPermissionsMap | null;
  customerScopeId?: string | null;
}): BookingReadProjectionContext {
  const permissions = input.permissions ?? null;
  const membershipRole = input.actor?.membershipRole as MembershipRole | undefined;
  const platformRole = input.actor?.platformRole;
  const opts = { membershipRole, platformRole };

  const canViewCustomerPii = evaluateModulePermission(permissions, 'customers', 'read', opts);
  const canViewFinance =
    evaluateModulePermission(permissions, 'invoices', 'read', opts) ||
    evaluateModulePermission(permissions, 'payments', 'read', opts);
  const canViewPayments = evaluateModulePermission(permissions, 'payments', 'read', opts);
  const canViewPaymentProviderRefs = evaluateModulePermission(
    permissions,
    'payments-settings',
    'manage',
    opts,
  );
  const canViewAudit =
    evaluateModulePermission(permissions, 'legal-documents-audit', 'read', opts) ||
    evaluateModulePermission(permissions, 'data-authorization', 'read', opts);
  const canViewRentalEligibility = evaluateModulePermission(
    permissions,
    BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.review'].module,
    BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.review'].level,
    opts,
  );
  const canViewSignatureReferences = evaluateModulePermission(
    permissions,
    BOOKING_SIGNATURE_PERMISSION_REQUIREMENTS['booking.signature.read'].module,
    BOOKING_SIGNATURE_PERMISSION_REQUIREMENTS['booking.signature.read'].level,
    opts,
  );

  return {
    actorUserId: input.actor?.id ?? null,
    membershipRole,
    platformRole,
    permissions,
    customerScopeId: input.customerScopeId ?? null,
    canViewCustomerPii,
    canViewFinance,
    canViewPayments,
    canViewPaymentProviderRefs,
    canViewAudit,
    canViewRentalEligibility,
    canViewSignatureReferences,
  };
}
