import {
  EnergyEventConfidence,
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import type { HvChargeSession } from '@prisma/client';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
} from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';
import {
  ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
  ERD_RECHARGE_PROJECTION_META_VERSION,
} from './erd-recharge-projection.constants';
import { buildErdRechargePhysicalProjectionSourceEventKey } from './erd-recharge-projection-identity.policy';
import {
  evaluateErdRechargeProjectionEligibility,
  type ErdRechargeProjectionEligibilityScope,
} from './erd-recharge-projection-eligibility.policy';
import { ERD_RECHARGE_LOCATION_AUTHORITY_VERSION } from '../erd-recharge-location-provenance/erd-recharge-location-authority.constants';
import { projectTrustedSessionLocationsToVeeCoordinates } from '../erd-recharge-location-provenance/erd-recharge-session-location.policy';

export interface ErdRechargeProjectionDraft {
  vehicleId: string;
  kind: typeof EnergyEventKind.RECHARGE;
  detectionSource: typeof VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION;
  sourceEventKey: string;
  canonicalChargeSessionId: string;
  dimoSegmentId: string | null;
  detectionMechanism: typeof ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  fuelDeltaLiters: null;
  fuelDeltaPercent: null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: EnergyEventConfidence;
  rawDetectionMeta: Record<string, unknown>;
  fuelLevelRiseStart: null;
  fuelLevelRiseEnd: null;
  fuelLevelRiseDurationSeconds: null;
  anchorSegmentFingerprint: string;
}

export type MapErdRechargeProjectionDraftResult =
  | { ok: true; draft: ErdRechargeProjectionDraft }
  | { ok: false; reason: string };

function readMetadata(session: HvChargeSession): Record<string, unknown> {
  if (session.metadata == null || typeof session.metadata !== 'object') {
    return {};
  }
  return session.metadata as Record<string, unknown>;
}

function resolveDimoSegmentIdForProjection(session: HvChargeSession): string | null {
  if (session.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    return null;
  }
  if (session.dimoSegmentId != null && session.dimoSegmentId.trim() !== '') {
    return session.dimoSegmentId;
  }
  return null;
}

function mapQualityToConfidence(session: HvChargeSession, metadata: Record<string, unknown>): EnergyEventConfidence {
  const status =
    typeof metadata.qualityStatus === 'string'
      ? metadata.qualityStatus
      : null;
  if (status === HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED) {
    const soc = session.deltaSocPercent ?? 0;
    if (soc >= 20) return EnergyEventConfidence.HIGH;
    if (soc >= 5) return EnergyEventConfidence.MEDIUM;
    return EnergyEventConfidence.LOW;
  }
  if (status === HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL) {
    return EnergyEventConfidence.MEDIUM;
  }
  return EnergyEventConfidence.LOW;
}

function computeDurationSeconds(session: HvChargeSession): number {
  if (session.endAt == null) {
    throw new Error('erd_recharge_projection_mapper_missing_end_at');
  }
  return Math.max(
    0,
    Math.floor((session.endAt.getTime() - session.startAt.getTime()) / 1000),
  );
}

/**
 * Pure mapper — does not persist. Caller must pass an eligibility-approved session.
 */
export function mapCanonicalHvChargeSessionToErdRechargeProjectionDraft(input: {
  session: HvChargeSession;
  scope: ErdRechargeProjectionEligibilityScope;
  /** Immutable projection anchor; defaults to session.segmentFingerprint at mint time. */
  anchorSegmentFingerprint?: string;
}): MapErdRechargeProjectionDraftResult {
  const metadata = readMetadata(input.session);
  const eligibility = evaluateErdRechargeProjectionEligibility({
    session: {
      organizationId: input.session.organizationId,
      vehicleId: input.session.vehicleId,
      source: input.session.source,
      segmentFingerprint: input.session.segmentFingerprint,
      idempotencyKey: input.session.idempotencyKey,
      startAt: input.session.startAt,
      endAt: input.session.endAt,
      isOngoing: input.session.isOngoing,
      metadata: input.session.metadata,
      qualityStatus: typeof metadata.qualityStatus === 'string' ? metadata.qualityStatus : null,
    },
    scope: input.scope,
  });
  if (!eligibility.projectable) {
    return { ok: false, reason: eligibility.reason };
  }

  const anchorSegmentFingerprint =
    input.anchorSegmentFingerprint ?? input.session.segmentFingerprint;
  const sourceEventKey = buildErdRechargePhysicalProjectionSourceEventKey({
    vehicleId: input.session.vehicleId,
    anchorSegmentFingerprint,
  });

  const endTime = input.session.endAt!;
  const durationSeconds = computeDurationSeconds(input.session);
  const location = projectTrustedSessionLocationsToVeeCoordinates(input.session);

  const draft: ErdRechargeProjectionDraft = {
    vehicleId: input.session.vehicleId,
    kind: EnergyEventKind.RECHARGE,
    detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
    sourceEventKey,
    canonicalChargeSessionId: input.session.id,
    dimoSegmentId: resolveDimoSegmentIdForProjection(input.session),
    detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
    startTime: input.session.startAt,
    endTime,
    durationSeconds,
    startLatitude: location.startLatitude,
    startLongitude: location.startLongitude,
    endLatitude: location.endLatitude,
    endLongitude: location.endLongitude,
    fuelDeltaLiters: null,
    fuelDeltaPercent: null,
    socDeltaPercent: input.session.deltaSocPercent,
    energyDeltaKwh: input.session.energyAddedKwh,
    odometerStartKm:
      typeof metadata.odometerStartKm === 'number' ? metadata.odometerStartKm : null,
    odometerEndKm: typeof metadata.odometerEndKm === 'number' ? metadata.odometerEndKm : null,
    confidence: mapQualityToConfidence(input.session, metadata),
    rawDetectionMeta: {
      projectionVersion: ERD_RECHARGE_PROJECTION_META_VERSION,
      locationAuthorityVersion: ERD_RECHARGE_LOCATION_AUTHORITY_VERSION,
      startLocationProvenance: location.startLocationProvenance,
      endLocationProvenance: location.endLocationProvenance,
      canonicalChargeSessionId: input.session.id,
      sessionSource: input.session.source,
      segmentFingerprint: input.session.segmentFingerprint,
      anchorSegmentFingerprint,
      dimoSegmentId: resolveDimoSegmentIdForProjection(input.session),
      qualityStatus: metadata.qualityStatus ?? null,
      qualityReasonCodes: metadata.qualityReasonCodes ?? null,
    },
    fuelLevelRiseStart: null,
    fuelLevelRiseEnd: null,
    fuelLevelRiseDurationSeconds: null,
    anchorSegmentFingerprint,
  };

  return { ok: true, draft };
}
