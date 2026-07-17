import { BatteryMeasurementQuality } from '@prisma/client';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import type { BatteryEvidenceStrength } from '../battery-v2-domain';
import type { HvFallbackChargeSessionCandidate } from './hv-fallback-charge-session.types';
import {
  HV_CHARGE_SESSION_QUALITY_REASONS,
  HV_CHARGE_SESSION_QUALITY_STATUS,
  type HvChargeSessionBoundaryStrength,
  type HvChargeSessionQualityReasonCode,
  type HvChargeSessionQualityStatus,
  type HvChargeSessionSourceStrength,
} from './hv-charge-session-quality.status';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
  type HvChargeSessionSource,
} from './hv-charge-session.types';

export const HV_SESSION_MIN_DURATION_SECONDS = 5 * 60;
export const HV_SESSION_MIN_SOC_DELTA_M2 = 5;
export const HV_SESSION_MIN_SOC_DELTA_M3 = 20;
export const HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH = 2;
export const HV_SESSION_PROVIDER_STALE_MS = 6 * 60 * 60 * 1000;

export interface HvChargeSessionQualityInput {
  source: HvChargeSessionSource;
  isOngoing: boolean;
  startAt: Date;
  endAt: Date | null;
  durationSeconds: number | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  addedEnergyMinKwh?: number | null;
  addedEnergyMaxKwh?: number | null;
  isChargingStart?: boolean | null;
  isChargingEnd?: boolean | null;
  cableConnectedStart?: boolean | null;
  cableConnectedEnd?: boolean | null;
  startedBeforeRange?: boolean;
  providerObservedAt?: Date | null;
  receivedAt?: Date | null;
  supersededBySegmentFingerprint?: string | null;
  fallbackEvidenceStrength?: BatteryEvidenceStrength | null;
  observationCount?: number | null;
  providerStale?: boolean;
  assessedAt?: Date;
}

export interface HvChargeSessionQualityAssessment {
  status: HvChargeSessionQualityStatus;
  measurementQuality: BatteryMeasurementQuality;
  reasonCodes: HvChargeSessionQualityReasonCode[];
  capacityShadowEligible: boolean;
  capacityValidationEligible: boolean;
  boundaryStrength: HvChargeSessionBoundaryStrength;
  sourceStrength: HvChargeSessionSourceStrength;
}

function pushReason(
  codes: HvChargeSessionQualityReasonCode[],
  code: HvChargeSessionQualityReasonCode,
): void {
  if (!codes.includes(code)) codes.push(code);
}

function resolveBoundaryStrength(input: HvChargeSessionQualityInput): HvChargeSessionBoundaryStrength {
  if (input.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
    return 'weak';
  }

  if (
    input.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE &&
    input.startAt &&
    input.endAt
  ) {
    return 'strong';
  }

  const chargingBoundary =
    input.isChargingStart === true || input.isChargingEnd === true;
  const cableBoundary =
    input.cableConnectedStart === true || input.cableConnectedEnd === true;

  if (chargingBoundary || cableBoundary) {
    return 'strong';
  }

  if (input.startAt && input.endAt) {
    return 'weak';
  }

  return 'invalid';
}

function resolveSourceStrength(
  input: HvChargeSessionQualityInput,
): HvChargeSessionSourceStrength {
  if (input.supersededBySegmentFingerprint) {
    return 'superseded';
  }
  if (input.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
    return 'telemetry_fallback';
  }
  return 'dimo_segment';
}

function mapStatusToMeasurementQuality(
  status: HvChargeSessionQualityStatus,
): BatteryMeasurementQuality {
  switch (status) {
    case HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED:
      return BatteryMeasurementQuality.VALID;
    case HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL:
      return BatteryMeasurementQuality.SHADOW;
    case HV_CHARGE_SESSION_QUALITY_STATUS.ONGOING:
      return BatteryMeasurementQuality.SHADOW;
    case HV_CHARGE_SESSION_QUALITY_STATUS.CONFLICTING_SOURCES:
      return BatteryMeasurementQuality.SHADOW;
    case HV_CHARGE_SESSION_QUALITY_STATUS.PROVIDER_GAPS:
      return BatteryMeasurementQuality.PROVIDER_DELAY;
    case HV_CHARGE_SESSION_QUALITY_STATUS.ADDED_ENERGY_RESET:
      return BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING;
    case HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_SOC_DELTA:
    case HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_COVERAGE:
      return BatteryMeasurementQuality.INSUFFICIENT_COVERAGE;
    case HV_CHARGE_SESSION_QUALITY_STATUS.INVALID:
      return BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT;
    default:
      return BatteryMeasurementQuality.NO_DATA;
  }
}

function isProviderStale(input: HvChargeSessionQualityInput): boolean {
  if (input.providerStale) return true;
  if (input.receivedAt && input.providerObservedAt) {
    const skewMs = Math.abs(
      input.receivedAt.getTime() - input.providerObservedAt.getTime(),
    );
    return skewMs > HV_SESSION_PROVIDER_STALE_MS;
  }
  return false;
}

function hasAddedEnergyReset(input: HvChargeSessionQualityInput): boolean {
  if (input.energyAddedKwh != null && input.energyAddedKwh < 0) {
    return true;
  }
  if (
    input.addedEnergyMinKwh != null &&
    input.addedEnergyMinKwh >= HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH
  ) {
    return true;
  }
  return false;
}

function hasCurrentEnergy(input: HvChargeSessionQualityInput): boolean {
  return input.startEnergyKwh != null && input.endEnergyKwh != null;
}

function resolveCapacityEligibility(
  status: HvChargeSessionQualityStatus,
  input: HvChargeSessionQualityInput,
): { shadow: boolean; validation: boolean } {
  const deltaSoc = input.deltaSocPercent ?? 0;
  if (status === HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED) {
    return {
      shadow: true,
      validation: deltaSoc >= HV_SESSION_MIN_SOC_DELTA_M3,
    };
  }
  if (status === HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL) {
    return {
      shadow:
        input.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE &&
        hasCurrentEnergy(input) &&
        deltaSoc >= HV_SESSION_MIN_SOC_DELTA_M2,
      validation: false,
    };
  }
  return { shadow: false, validation: false };
}

export function assessHvChargeSessionQualityFromInput(
  input: HvChargeSessionQualityInput,
): HvChargeSessionQualityAssessment {
  const assessedAt = input.assessedAt ?? new Date();
  const reasonCodes: HvChargeSessionQualityReasonCode[] = [];
  const boundaryStrength = resolveBoundaryStrength(input);
  const sourceStrength = resolveSourceStrength(input);
  const durationSeconds =
    input.durationSeconds ??
    (input.endAt
      ? Math.max(0, Math.round((input.endAt.getTime() - input.startAt.getTime()) / 1000))
      : null);
  const deltaSoc =
    input.deltaSocPercent ??
    (input.startSocPercent != null && input.endSocPercent != null
      ? Math.max(0, input.endSocPercent - input.startSocPercent)
      : null);

  if (
    input.startSocPercent != null &&
    input.endSocPercent != null &&
    input.endSocPercent < input.startSocPercent
  ) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.invalid_soc_range);
    return finalize(HV_CHARGE_SESSION_QUALITY_STATUS.INVALID, input, reasonCodes, boundaryStrength, sourceStrength);
  }

  if (
    input.startAt &&
    input.endAt &&
    input.startAt.getTime() === input.endAt.getTime()
  ) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.duplicate_timestamps);
    return finalize(HV_CHARGE_SESSION_QUALITY_STATUS.INVALID, input, reasonCodes, boundaryStrength, sourceStrength);
  }

  if (input.startSocPercent == null && input.endSocPercent == null) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.missing_soc_data);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_COVERAGE,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (input.supersededBySegmentFingerprint) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.superseded_by_dimo_segment);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.CONFLICTING_SOURCES,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (input.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.telemetry_fallback_source);
  }

  if (input.isOngoing) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.ongoing_session);
    return finalize(HV_CHARGE_SESSION_QUALITY_STATUS.ONGOING, input, reasonCodes, boundaryStrength, sourceStrength);
  }

  if (hasAddedEnergyReset(input)) {
    pushReason(
      reasonCodes,
      input.energyAddedKwh != null && input.energyAddedKwh < 0
        ? HV_CHARGE_SESSION_QUALITY_REASONS.added_energy_negative_delta
        : HV_CHARGE_SESSION_QUALITY_REASONS.added_energy_reset_mid_session,
    );
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.ADDED_ENERGY_RESET,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (input.startedBeforeRange) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.provider_gap_started_before_range);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.PROVIDER_GAPS,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (!input.endAt) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.provider_gap_missing_end);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.PROVIDER_GAPS,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (isProviderStale(input)) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.stale_provider_data);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.PROVIDER_GAPS,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (durationSeconds == null || durationSeconds < HV_SESSION_MIN_DURATION_SECONDS) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.duration_insufficient);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_COVERAGE,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (
    input.observationCount != null &&
    input.observationCount < 3
  ) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.sample_coverage_low);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_COVERAGE,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (deltaSoc == null || deltaSoc <= 0) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.soc_delta_insufficient);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_SOC_DELTA,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (!hasCurrentEnergy(input)) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.current_energy_unavailable);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_COVERAGE,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (boundaryStrength === 'weak') {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.weak_session_boundaries);
  } else {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.strong_dimo_boundaries);
  }

  if (deltaSoc < HV_SESSION_MIN_SOC_DELTA_M2) {
    pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.soc_delta_insufficient);
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_SOC_DELTA,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  if (
    input.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK ||
    boundaryStrength === 'weak' ||
    deltaSoc < HV_SESSION_MIN_SOC_DELTA_M3
  ) {
    if (deltaSoc >= HV_SESSION_MIN_SOC_DELTA_M2) {
      pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.soc_delta_partial_m2);
    }
    return finalize(
      HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL,
      input,
      reasonCodes,
      boundaryStrength,
      sourceStrength,
    );
  }

  pushReason(reasonCodes, HV_CHARGE_SESSION_QUALITY_REASONS.soc_delta_qualified);
  return finalize(
    HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
    input,
    reasonCodes,
    boundaryStrength,
    sourceStrength,
  );
}

function finalize(
  status: HvChargeSessionQualityStatus,
  input: HvChargeSessionQualityInput,
  reasonCodes: HvChargeSessionQualityReasonCode[],
  boundaryStrength: HvChargeSessionBoundaryStrength,
  sourceStrength: HvChargeSessionSourceStrength,
): HvChargeSessionQualityAssessment {
  const eligibility = resolveCapacityEligibility(status, input);
  return {
    status,
    measurementQuality: mapStatusToMeasurementQuality(status),
    reasonCodes,
    capacityShadowEligible: eligibility.shadow,
    capacityValidationEligible: eligibility.validation,
    boundaryStrength,
    sourceStrength,
  };
}

export function assessHvChargeSessionQualityFromDimoSegment(
  segment: NormalizedDimoRechargeSegment,
  assessedAt: Date = new Date(),
): HvChargeSessionQualityAssessment {
  return assessHvChargeSessionQualityFromInput({
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    isOngoing: segment.ongoing,
    startAt: new Date(segment.startAt),
    endAt: segment.endAt ? new Date(segment.endAt) : null,
    durationSeconds: segment.durationSeconds,
    startSocPercent: segment.soc.min,
    endSocPercent: segment.soc.max,
    startEnergyKwh: segment.currentEnergyKwh.min,
    endEnergyKwh: segment.currentEnergyKwh.max,
    energyAddedKwh: segment.addedEnergyKwh.delta,
    deltaSocPercent: segment.soc.delta,
    addedEnergyMinKwh: segment.addedEnergyKwh.min,
    addedEnergyMaxKwh: segment.addedEnergyKwh.max,
    isChargingStart: segment.isCharging.start,
    isChargingEnd: segment.isCharging.end,
    cableConnectedStart: segment.cableConnected.start,
    cableConnectedEnd: segment.cableConnected.end,
    startedBeforeRange: segment.startedBeforeRange,
    providerObservedAt: segment.endAt
      ? new Date(segment.endAt)
      : new Date(segment.startAt),
    assessedAt,
  });
}

export function assessHvChargeSessionQualityFromFallbackCandidate(
  candidate: HvFallbackChargeSessionCandidate,
  assessedAt: Date = new Date(),
): HvChargeSessionQualityAssessment {
  return assessHvChargeSessionQualityFromInput({
    source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    isOngoing: candidate.isOngoing,
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    durationSeconds: candidate.endAt
      ? Math.round((candidate.endAt.getTime() - candidate.startAt.getTime()) / 1000)
      : null,
    startSocPercent: candidate.startSocPercent,
    endSocPercent: candidate.endSocPercent,
    startEnergyKwh: candidate.startEnergyKwh,
    endEnergyKwh: candidate.endEnergyKwh,
    energyAddedKwh: candidate.energyAddedKwh,
    deltaSocPercent: candidate.deltaSocPercent,
    providerObservedAt: candidate.endAt ?? candidate.startAt,
    fallbackEvidenceStrength: candidate.evidenceStrength,
    observationCount: candidate.observationCount,
    providerStale: candidate.providerStale,
    assessedAt,
  });
}

export function isHvChargeSessionCapacityShadowEligible(
  assessment: HvChargeSessionQualityAssessment,
): boolean {
  return assessment.capacityShadowEligible;
}
