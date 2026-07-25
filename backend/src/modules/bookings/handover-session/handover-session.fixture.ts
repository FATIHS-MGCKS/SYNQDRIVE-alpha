import type { HandoverKind } from '@prisma/client';
import type {
  HandoverSessionPermissionContext,
  HandoverTransitionEvaluateInput,
} from './handover-session.types';
import { HANDOVER_SESSION_NOT_STARTED } from './handover-session.types';

const defaultPermissions: HandoverSessionPermissionContext = {
  canWriteBookings: true,
  canCompletePickup: true,
  canOverrideScope: true,
  canOverridePickupGate: true,
  canSupersede: true,
};

export function buildHandoverTransitionInput(
  overrides: Partial<HandoverTransitionEvaluateInput> = {},
): HandoverTransitionEvaluateInput {
  return {
    organizationId: 'org-1',
    bookingId: 'booking-1',
    kind: 'PICKUP' as HandoverKind,
    fromStatus: HANDOVER_SESSION_NOT_STARTED,
    toStatus: 'DRAFT',
    action: 'START',
    expectedVersion: null,
    currentVersion: null,
    lockedByUserId: null,
    actor: {
      userId: 'user-1',
      displayName: 'Operator',
      platformRole: null,
      membershipRole: 'WORKER',
    },
    permissions: { ...defaultPermissions },
    scope: { stationWritable: true, actualStationId: 'station-1' },
    scopeOverrideReason: null,
    cancelReason: null,
    supersedeReason: null,
    booking: {
      status: 'CONFIRMED',
      vehicleId: 'vehicle-1',
      pickupStationId: 'station-1',
      returnStationId: 'station-1',
      hasPickupProtocol: false,
      hasReturnProtocol: false,
    },
    vehicle: {
      status: 'AVAILABLE',
      rentalBlocked: false,
      blockingReasons: [],
    },
    existingCompletedProtocolId: null,
    requirements: {
      blockers: [],
      pickupGateOverrideReason: null,
      eligibilityApprovalId: null,
    },
    payload: {
      documentsAcknowledged: true,
      customerSignatureDataUrl: 'data:image/png;base64,abc',
      customerSignatureName: 'Customer',
      staffSignatureDataUrl: 'data:image/png;base64,def',
      staffSignatureName: 'Staff',
      odometerKm: 12000,
    },
    ...overrides,
  };
}
