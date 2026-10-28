import type { PrismaClient } from '@prisma/client';
import {
  evaluateTripDiBoundaryAdmission,
  type TripDiBoundaryAdmissionScope,
} from '../../trips/di-boundary-admission/trip-di-boundary-admission';
import type { TripDiBoundaryAdmissionService } from '../../trips/di-boundary-admission/trip-di-boundary-admission.service';

export type Ds4AssessmentCanonicalScopeGuardCodeV1 =
  | 'SCOPE_MISMATCH'
  | 'VEHICLE_NOT_FOUND'
  | 'TRIP_NOT_FOUND'
  | 'ORGANIZATION_TENANCY_MISMATCH'
  | 'TRIP_VEHICLE_MISMATCH'
  | 'BOUNDARY_ADMISSION_BLOCKED'
  | 'MOTION_RUN_NOT_FOUND';

export type Ds4AssessmentCanonicalScopeVerifyResultV1 =
  | { ok: true }
  | { ok: false; code: Ds4AssessmentCanonicalScopeGuardCodeV1; detail?: string };

export type Ds4AssessmentProcessorScopeV1 = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceMotionRunId: string;
};

export type Ds4AssessmentMotionRunIdentityV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
};

export async function verifyDs4AssessmentCanonicalScopeBeforePersistV1(
  prisma: PrismaClient,
  scope: Ds4AssessmentProcessorScopeV1,
  motionRun: Ds4AssessmentMotionRunIdentityV1,
  boundaryAdmission: Pick<TripDiBoundaryAdmissionService, 'loadScope'>,
): Promise<Ds4AssessmentCanonicalScopeVerifyResultV1> {
  if (motionRun.id !== scope.sourceMotionRunId) {
    return { ok: false, code: 'SCOPE_MISMATCH', detail: 'sourceMotionRunId' };
  }
  if (
    motionRun.organizationId !== scope.organizationId ||
    motionRun.vehicleId !== scope.vehicleId ||
    motionRun.tripId !== scope.tripId
  ) {
    return { ok: false, code: 'SCOPE_MISMATCH', detail: 'motion_run_identity' };
  }

  const vehicleRows = await prisma.$queryRaw<Array<{ organization_id: string }>>`
    SELECT organization_id FROM vehicles WHERE id = ${scope.vehicleId} LIMIT 1`;
  const vehicle = vehicleRows[0];
  if (!vehicle) {
    return { ok: false, code: 'VEHICLE_NOT_FOUND' };
  }
  if (vehicle.organization_id !== scope.organizationId) {
    return { ok: false, code: 'ORGANIZATION_TENANCY_MISMATCH', detail: 'vehicle.organization_id' };
  }
  if (vehicle.organization_id !== motionRun.organizationId) {
    return { ok: false, code: 'ORGANIZATION_TENANCY_MISMATCH', detail: 'motion_run.organization_id' };
  }

  const tripRows = await prisma.$queryRaw<
    Array<{ vehicle_id: string; organization_id: string }>
  >`
    SELECT t.vehicle_id, v.organization_id
    FROM vehicle_trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.id = ${scope.tripId}
    LIMIT 1`;
  const trip = tripRows[0];
  if (!trip) {
    return { ok: false, code: 'TRIP_NOT_FOUND' };
  }
  if (trip.vehicle_id !== scope.vehicleId || trip.vehicle_id !== motionRun.vehicleId) {
    return { ok: false, code: 'TRIP_VEHICLE_MISMATCH' };
  }
  if (trip.organization_id !== scope.organizationId) {
    return { ok: false, code: 'ORGANIZATION_TENANCY_MISMATCH', detail: 'trip.organization_id' };
  }

  const admissionScope = await boundaryAdmission.loadScope(scope.tripId);
  if (!admissionScope) {
    return { ok: false, code: 'TRIP_NOT_FOUND', detail: 'boundary_scope' };
  }
  if (
    admissionScope.organizationId !== scope.organizationId ||
    admissionScope.vehicleId !== scope.vehicleId ||
    admissionScope.tripId !== scope.tripId
  ) {
    return { ok: false, code: 'SCOPE_MISMATCH', detail: 'boundary_scope_identity' };
  }

  const admission = evaluateTripDiBoundaryAdmission(admissionScope);
  if (!admission.ok) {
    return { ok: false, code: 'BOUNDARY_ADMISSION_BLOCKED', detail: admission.code };
  }

  return { ok: true };
}
