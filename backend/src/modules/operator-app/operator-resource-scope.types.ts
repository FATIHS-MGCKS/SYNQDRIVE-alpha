import type { MembershipRole } from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import type { StationAccessContext } from '@shared/stations/station-access.types';

/** Resolved operator station + assignment context for a single org actor. */
export interface OperatorScopeContext extends StationAccessContext {
  organizationId: string;
  fieldAgentAccess: boolean;
  permissions: MembershipPermissionsMap | null;
  membershipRole: MembershipRole | null;
}

export interface BookingStationRef {
  pickupStationId?: string | null;
  returnStationId?: string | null;
  actualPickupStationId?: string | null;
  actualReturnStationId?: string | null;
}

export interface VehicleStationRef {
  homeStationId?: string | null;
  currentStationId?: string | null;
}

export interface TaskScopeRef {
  id?: string;
  assignedUserId?: string | null;
  metadata?: unknown;
  vehicleId?: string | null;
  bookingId?: string | null;
  status?: string;
}

export interface OperatorScopeOverrideInput {
  scopeOverrideReason?: string | null;
}

export type OperatorScopeResourceKind =
  | 'booking'
  | 'task'
  | 'vehicle'
  | 'handover'
  | 'damage'
  | 'document';

export interface OperatorScopeOverrideAuditInput {
  organizationId: string;
  actorUserId: string;
  resourceKind: OperatorScopeResourceKind;
  resourceId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}
