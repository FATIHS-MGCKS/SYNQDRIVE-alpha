/**
 * Read-only admission snapshot for EV GT baseline (ops script; mirrors trip-di-boundary-admission).
 */
import { buildDiV0S4BoundaryFingerprint } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import {
  isBoundaryRefreshRetryable,
  readBoundaryRefreshRecord,
  readCurrentBoundaryRepairGeneration,
} from '../../src/modules/vehicle-intelligence/trips/boundary-repair.state.util';

const ADMISSION_KEY = 'diV0BoundaryAdmissionV1';

export type EvGtAdmissionScope = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripStatus: string;
  startTime: Date;
  endTime: Date | null;
  dimoSegmentId: string | null;
  mergeParentTripId: string | null;
  rawDetectionMeta: unknown;
  detectionState: string | null;
  activeTripId: string | null;
  proposedBoundaryRepairCount: number;
};

function readAdmissionV1(raw: unknown): {
  revisionKey: string;
  releasedAtUtc: string;
  releasedBy: string;
} | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = (raw as Record<string, unknown>)[ADMISSION_KEY];
  if (record == null || typeof record !== 'object' || Array.isArray(record)) return null;
  const r = record as Record<string, unknown>;
  const revisionKey = typeof r.revisionKey === 'string' ? r.revisionKey : '';
  const releasedAtUtc = typeof r.releasedAtUtc === 'string' ? r.releasedAtUtc : '';
  const releasedBy = typeof r.releasedBy === 'string' ? r.releasedBy : '';
  if (!revisionKey || !releasedAtUtc || !releasedBy) return null;
  return { revisionKey, releasedAtUtc, releasedBy };
}

function revisionKeyForScope(scope: EvGtAdmissionScope): string {
  return buildDiV0S4BoundaryFingerprint({
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    tripId: scope.tripId,
    tripStatus: scope.tripStatus,
    startTime: scope.startTime,
    endTime: scope.endTime!,
    dimoSegmentId: scope.dimoSegmentId,
    mergeParentTripId: scope.mergeParentTripId,
    boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(scope.rawDetectionMeta),
  });
}

export function evaluateEvGtAdmission(scope: EvGtAdmissionScope): Record<string, unknown> {
  if (scope.tripStatus !== 'COMPLETED' || scope.endTime == null) {
    return { ok: false, code: 'TRIP_NOT_COMPLETED' };
  }
  if (scope.detectionState != null && scope.detectionState !== 'RESTING') {
    return { ok: false, code: 'FSM_STILL_ACTIVE_ON_TRIP' };
  }
  if (scope.activeTripId != null && scope.activeTripId === scope.tripId) {
    return { ok: false, code: 'FSM_STILL_ACTIVE_ON_TRIP' };
  }
  if (scope.proposedBoundaryRepairCount > 0) {
    return { ok: false, code: 'PROPOSED_BOUNDARY_REPAIR_OPEN' };
  }
  const refresh = readBoundaryRefreshRecord(scope.rawDetectionMeta);
  if (isBoundaryRefreshRetryable(refresh)) {
    return { ok: false, code: 'BOUNDARY_REFRESH_IN_FLIGHT' };
  }
  const revisionKey = revisionKeyForScope(scope);
  const admission = readAdmissionV1(scope.rawDetectionMeta);
  if (!admission) return { ok: false, code: 'ADMISSION_RECORD_MISSING', expectedRevisionKey: revisionKey };
  if (admission.revisionKey !== revisionKey) {
    return {
      ok: false,
      code: 'ADMISSION_REVISION_MISMATCH',
      expectedRevisionKey: revisionKey,
      storedRevisionKey: admission.revisionKey,
    };
  }
  return { ok: true, admission, expectedRevisionKey: revisionKey };
}

export function evaluateEvGtProductReadGate(
  scope: EvGtAdmissionScope,
  expectedBoundaryFingerprint: string,
): Record<string, unknown> {
  if (scope.endTime == null) return { ok: false, reason: 'TRIP_NOT_FOUND' };
  const admission = evaluateEvGtAdmission(scope);
  if (!admission.ok) return { ok: false, reason: 'ADMISSION_NOT_SATISFIED', admission };
  const current = revisionKeyForScope(scope);
  if (current !== expectedBoundaryFingerprint) {
    return {
      ok: false,
      reason: 'BOUNDARY_FINGERPRINT_MISMATCH',
      liveFingerprint: current,
      expectedBoundaryFingerprint,
    };
  }
  const stored = readAdmissionV1(scope.rawDetectionMeta);
  if (stored && stored.revisionKey !== current) {
    return { ok: false, reason: 'BOUNDARY_FINGERPRINT_MISMATCH', admissionRevision: stored.revisionKey };
  }
  return { ok: true, boundaryFingerprint: current };
}
