import { evaluateModulePermission, normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS } from '@modules/documents/legal-document-permission.constants';
import type { HandoverSessionPermissionContext } from './handover-session.types';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';

type MembershipRow = {
  role: string;
  status: string;
  permissions: unknown;
};

import { OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS } from './operator-handover-permission.constants';
export function resolveHandoverSessionPermissions(
  membership: MembershipRow | null,
  actor: HandoverActorContext,
): HandoverSessionPermissionContext {
  if (actor.platformRole === 'MASTER_ADMIN') {
    return {
      canWriteBookings: true,
      canCompletePickup: true,
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
  const completePickup =
    OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS['operator.handover.complete'];
  const overrideScope =
    OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS['operator.handover.override'];

  return {
    canWriteBookings: evaluateModulePermission(permissions, 'bookings', 'write', options),
    canCompletePickup: evaluateModulePermission(
      permissions,
      completePickup.module,
      completePickup.level,
      options,
    ),
    canOverrideScope: evaluateModulePermission(
      permissions,
      overrideScope.module,
      overrideScope.level,
      options,
    ),
    canOverridePickupGate: evaluateModulePermission(
      permissions,
      overrideHandover.module,
      overrideHandover.level,
      options,
    ),
    canSupersede: evaluateModulePermission(permissions, 'bookings', 'manage', options),
  };
}
