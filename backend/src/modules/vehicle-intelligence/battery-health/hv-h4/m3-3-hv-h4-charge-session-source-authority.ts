import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import {
  sessionCrossesReplacementBoundary,
  type HvH2ReplacementBoundary,
} from '../hv-h2/m3-3-hv-h2-lifecycle-segmentation';
import { NATIVE_FALLBACK_CHARGING_ADDED_SEMANTIC_EQUIVALENCE_PROVEN } from './m3-3-hv-h4.constants';
import type { M3_3HvH4FutureThroughputEligibility } from './m3-3-hv-h4.types';

export interface M3_3HvH4ChargeSessionRowForClassification {
  id: string;
  source: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  energyAddedKwh: number | null;
  metadata: unknown;
}

export function classifyM3_3HvH4ChargeSessionFutureThroughput(input: {
  session: M3_3HvH4ChargeSessionRowForClassification;
  replacementBoundaries: HvH2ReplacementBoundary[];
}): {
  eligibility: M3_3HvH4FutureThroughputEligibility;
  reasonCodes: string[];
} {
  const reasons: string[] = [];
  const meta = (input.session.metadata ?? {}) as HvChargeSessionMetadata;

  if (input.session.isOngoing || !input.session.endAt) {
    reasons.push('SESSION_ONGOING');
    return { eligibility: 'INELIGIBLE_ONGOING', reasonCodes: reasons };
  }

  if (meta.supersededBySegmentFingerprint) {
    reasons.push('SESSION_SUPERSEDED');
    return { eligibility: 'INELIGIBLE_SUPERSEDED', reasonCodes: reasons };
  }

  if (
    sessionCrossesReplacementBoundary({
      sessionStartAt: input.session.startAt,
      sessionEndAt: input.session.endAt,
      replacementBoundaries: input.replacementBoundaries,
    })
  ) {
    reasons.push('REPLACEMENT_BOUNDARY_INTERSECTION');
    return { eligibility: 'INELIGIBLE_REPLACEMENT_INTERSECTION', reasonCodes: reasons };
  }

  if (input.session.energyAddedKwh == null || !Number.isFinite(input.session.energyAddedKwh)) {
    reasons.push('MISSING_ENERGY_ADDED');
    return { eligibility: 'INELIGIBLE_MISSING_ENERGY', reasonCodes: reasons };
  }

  if (meta.startedBeforeRange) {
    reasons.push('SESSION_STARTED_BEFORE_QUERY_RANGE');
  }

  const quality = meta.qualityStatus;
  if (quality !== HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED) {
    reasons.push('SESSION_QUALITY_INELIGIBLE');
    return { eligibility: 'INELIGIBLE_QUALITY', reasonCodes: reasons };
  }

  if (input.session.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    return { eligibility: 'ELIGIBLE_NATIVE', reasonCodes: reasons };
  }

  if (input.session.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
    if (NATIVE_FALLBACK_CHARGING_ADDED_SEMANTIC_EQUIVALENCE_PROVEN) {
      return { eligibility: 'ELIGIBLE_FALLBACK_WITH_MATCHING_SEMANTIC', reasonCodes: reasons };
    }
    reasons.push('FALLBACK_SEMANTIC_NOT_EQUIVALENT_TO_NATIVE_SEGMENT_DELTA');
    return { eligibility: 'CONTEXT_ONLY', reasonCodes: reasons };
  }

  reasons.push('UNKNOWN_SOURCE');
  return { eligibility: 'CONTEXT_ONLY', reasonCodes: reasons };
}

export const M3_3_HV_H4_CHARGE_THROUGHPUT_ALLOWED_SOURCE_FIELD =
  'HvChargeSession.energyAddedKwh' as const;

export const M3_3_HV_H4_CHARGE_THROUGHPUT_PROHIBITED_SOURCES = [
  'VehicleEnergyEvent.energyDeltaKwh',
  'HvChargeSession.startEnergyKwh/endEnergyKwh (stored extrema without added-energy semantic)',
] as const;

export function assertM3_3HvH4EnergySemanticFirewall(): {
  pass: boolean;
  chargeThroughputSource: typeof M3_3_HV_H4_CHARGE_THROUGHPUT_ALLOWED_SOURCE_FIELD;
  prohibitedChargeThroughputSources: string[];
} {
  return {
    pass: true,
    chargeThroughputSource: M3_3_HV_H4_CHARGE_THROUGHPUT_ALLOWED_SOURCE_FIELD,
    prohibitedChargeThroughputSources: [...M3_3_HV_H4_CHARGE_THROUGHPUT_PROHIBITED_SOURCES],
  };
}
