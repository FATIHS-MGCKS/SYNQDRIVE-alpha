import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS } from '@modules/documents/legal-document-permission.constants';
import type { HandoverSessionPermissionContext } from './handover-session.types';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';

type MembershipRow = {
  role: string;
  status: string;
  permissions: unknown;
};

/**
 * Resolves handover session permission flags from membership permissions.
 * Scope override uses `bookings.manage` until `operator.handover.override` is registered.
 */
export function resolveHandoverSessionPermissions(
  membership: MembershipRow | null,
  actor: HandoverActorContext,
): HandoverSessionPermissionContext {
  if (actor.platformRole === 'MASTER_ADMIN') {
    return {
      canWriteBookings: true,
      canOverrideScope: true,
      canOverridePickupGate: true,
      canSupersede: true,
    };
  }

  const permissions = normalizeMembershipPermissions(membership?.permissions);
  const options = {
    membershipRole: membership?.role as never,
    platformRole: actor.platformRole,
    membershipStatus: membership?.status as never,
  };

  const overrideHandover =
    LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.override_handover'];

  return {
    canWriteBookings: evaluateModulePermission(permissions, 'bookings', 'write', options),
    canOverrideScope: evaluateModulePermission(permissions, 'bookings', 'manage', options),
    canOverridePickupGate: evaluateModulePermission(
      permissions,
      overrideHandover.module,
      overrideHandover.level,
      options,
    ),
    canSupersede: evaluateModulePermission(permissions, 'bookings', 'manage', options),
  };
}
