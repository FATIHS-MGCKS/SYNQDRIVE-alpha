import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
  type HvChargeSessionSource,
} from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { HV_SESSION_MIN_DURATION_SECONDS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';

export const ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON = {
  ORGANIZATION_MISMATCH: 'organization_mismatch',
  VEHICLE_MISMATCH: 'vehicle_mismatch',
  ONGOING_SESSION: 'ongoing_session',
  MISSING_END_AT: 'missing_end_at',
  INVALID_TIME_BOUNDARY: 'invalid_time_boundary',
  INVALID_DURATION: 'invalid_duration',
  DURATION_BELOW_MINIMUM: 'duration_below_minimum',
  SUPERSEDED_FALLBACK: 'superseded_fallback',
  UNSUPPORTED_SOURCE: 'unsupported_source',
  MISSING_SEGMENT_FINGERPRINT: 'missing_segment_fingerprint',
  MISSING_IDEMPOTENCY_KEY: 'missing_idempotency_key',
  QUALITY_ONGOING: 'quality_ongoing',
  QUALITY_INVALID: 'quality_invalid',
  QUALITY_CONFLICTING_SOURCES: 'quality_conflicting_sources',
} as const;

export type ErdRechargeProjectionIneligibleReason =
  (typeof ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON)[keyof typeof ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON];

export interface ErdRechargeProjectionEligibilitySession {
  organizationId: string;
  vehicleId: string;
  source: string;
  segmentFingerprint: string;
  idempotencyKey: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  metadata: unknown;
  qualityStatus?: string | null;
}

export interface ErdRechargeProjectionEligibilityScope {
  organizationId: string;
  vehicleId: string;
}

export type ErdRechargeProjectionEligibilityResult =
  | { projectable: true }
  | { projectable: false; reason: ErdRechargeProjectionIneligibleReason };

const SUPPORTED_SOURCES: ReadonlySet<HvChargeSessionSource> = new Set([
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
]);

function computeDurationSeconds(startAt: Date, endAt: Date): number {
  return Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 1000));
}

function readSupersededFingerprint(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object') return null;
  const value = (metadata as { supersededBySegmentFingerprint?: unknown })
    .supersededBySegmentFingerprint;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isSupportedSource(source: string): source is HvChargeSessionSource {
  return SUPPORTED_SOURCES.has(source as HvChargeSessionSource);
}

function resolveQualityStatus(session: ErdRechargeProjectionEligibilitySession): string | null {
  if (session.qualityStatus != null) return session.qualityStatus;
  if (session.metadata != null && typeof session.metadata === 'object') {
    const value = (session.metadata as { qualityStatus?: unknown }).qualityStatus;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/**
 * Pure fail-closed projectability gate for canonical HvChargeSession → VEE RECHARGE (E5.1).
 * Does not perform DB I/O; does not resolve cross-session canonical winner (E5.2 projector).
 */
export function evaluateErdRechargeProjectionEligibility(input: {
  session: ErdRechargeProjectionEligibilitySession;
  scope: ErdRechargeProjectionEligibilityScope;
}): ErdRechargeProjectionEligibilityResult {
  const { session, scope } = input;

  if (session.organizationId !== scope.organizationId) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.ORGANIZATION_MISMATCH };
  }
  if (session.vehicleId !== scope.vehicleId) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.VEHICLE_MISMATCH };
  }
  if (!session.segmentFingerprint?.trim()) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.MISSING_SEGMENT_FINGERPRINT };
  }
  if (!session.idempotencyKey?.trim()) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.MISSING_IDEMPOTENCY_KEY };
  }
  if (!isSupportedSource(session.source)) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.UNSUPPORTED_SOURCE };
  }
  if (session.isOngoing) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.ONGOING_SESSION };
  }
  if (session.endAt == null) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.MISSING_END_AT };
  }
  if (session.endAt.getTime() <= session.startAt.getTime()) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.INVALID_TIME_BOUNDARY };
  }

  const durationSeconds = computeDurationSeconds(session.startAt, session.endAt);
  if (durationSeconds <= 0) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.INVALID_DURATION };
  }
  if (durationSeconds < HV_SESSION_MIN_DURATION_SECONDS) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.DURATION_BELOW_MINIMUM };
  }

  if (readSupersededFingerprint(session.metadata) != null) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.SUPERSEDED_FALLBACK };
  }

  const qualityStatus = resolveQualityStatus(session);
  if (qualityStatus === HV_CHARGE_SESSION_QUALITY_STATUS.ONGOING) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.QUALITY_ONGOING };
  }
  if (qualityStatus === HV_CHARGE_SESSION_QUALITY_STATUS.INVALID) {
    return { projectable: false, reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.QUALITY_INVALID };
  }
  if (qualityStatus === HV_CHARGE_SESSION_QUALITY_STATUS.CONFLICTING_SOURCES) {
    return {
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.QUALITY_CONFLICTING_SOURCES,
    };
  }

  return { projectable: true };
}
