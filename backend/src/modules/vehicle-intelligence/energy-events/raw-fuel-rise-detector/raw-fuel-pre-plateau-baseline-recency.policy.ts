import type { RawRefuelCandidateSignalChannel } from '@prisma/client';
import type { RawFuelRiseDetectorConfig } from './raw-fuel-rise-detector.config';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from './raw-fuel-rise-detector.config';

export type RawFuelPrePlateauBaselineRecencyClassification =
  | 'FRESH'
  | 'STALE'
  | 'INSUFFICIENT_EVIDENCE';

export interface RawFuelPrePlateauBaselineRecencySample {
  timestamp: Date;
  value: number;
}

export interface RawFuelPrePlateauBaselineRecencyEvaluation {
  classification: RawFuelPrePlateauBaselineRecencyClassification;
  reason: string;
  bridgeGapSeconds: number;
  interveningPrimarySampleCount: number;
  interveningContradictionCount: number;
  prePlateauStartAt: Date | null;
  prePlateauEndAt: Date | null;
  riseOnsetAt: Date | null;
}

/** Derived from F3 detector continuity — not an ad-hoc constant. */
export const RFRF_BASELINE_RECENCY_MAX_BRIDGE_SECONDS =
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs / 1000;

export const RFRF_BASELINE_RECENCY_MAX_BRIDGE_MS =
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs;

function channelCfg(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
) {
  return channel === 'ABSOLUTE_LITERS' ? config.absolute : config.relative;
}

function plateauTolerance(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.prePlateauToleranceLiters
    : config.relative.prePlateauTolerancePercent;
}

function negativeWobble(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.negativeWobbleLiters
    : config.relative.negativeWobblePercent;
}

function materialThreshold(
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): number {
  return channel === 'ABSOLUTE_LITERS'
    ? config.absolute.materialRiseLiters
    : config.relative.materialRisePercent;
}

function isInterveningContradiction(
  preMedian: number,
  value: number,
  channel: RawRefuelCandidateSignalChannel,
  config: RawFuelRiseDetectorConfig,
): boolean {
  const platTol = plateauTolerance(channel, config);
  const wobble = negativeWobble(channel, config);
  const material = materialThreshold(channel, config);
  const departureBand = preMedian - wobble - platTol;
  if (value < departureBand) {
    return true;
  }
  if (preMedian - value >= material) {
    return true;
  }
  return false;
}

/**
 * Pre-fill baseline may represent immediate pre-refuel fuel only when temporally and
 * semantically recent. Long silent PRE→RISE bridges without intervening samples fail
 * closed (INSUFFICIENT_EVIDENCE); stale plateaus with intervening material change → STALE.
 */
export function evaluateRawFuelPrePlateauRecency(input: {
  prePlateauStartAt: Date | null | undefined;
  prePlateauEndAt: Date | null | undefined;
  riseOnsetAt: Date | null | undefined;
  riseOnsetPrimaryValue: number | null | undefined;
  prePlateauMedian: number;
  interveningPrimarySamples: RawFuelPrePlateauBaselineRecencySample[];
  signalChannel: RawRefuelCandidateSignalChannel;
  config?: RawFuelRiseDetectorConfig;
}): RawFuelPrePlateauBaselineRecencyEvaluation {
  const config = input.config ?? RAW_FUEL_RISE_DETECTOR_CONFIG_V1;
  const maxBridgeSeconds = channelCfg(input.signalChannel, config).maxSampleGapMs / 1000;

  if (!input.prePlateauEndAt || !input.riseOnsetAt) {
    return {
      classification: 'INSUFFICIENT_EVIDENCE',
      reason: 'missing_pre_or_rise_timestamps',
      bridgeGapSeconds: 0,
      interveningPrimarySampleCount: 0,
      interveningContradictionCount: 0,
      prePlateauStartAt: input.prePlateauStartAt ?? null,
      prePlateauEndAt: input.prePlateauEndAt ?? null,
      riseOnsetAt: input.riseOnsetAt ?? null,
    };
  }

  const bridgeGapSeconds = Math.round(
    (input.riseOnsetAt.getTime() - input.prePlateauEndAt.getTime()) / 1000,
  );

  const intervening = input.interveningPrimarySamples.filter(
    (s) =>
      s.timestamp.getTime() > input.prePlateauEndAt!.getTime() &&
      s.timestamp.getTime() < input.riseOnsetAt!.getTime(),
  );

  let interveningContradictionCount = 0;
  for (const sample of intervening) {
    if (
      isInterveningContradiction(
        input.prePlateauMedian,
        sample.value,
        input.signalChannel,
        config,
      )
    ) {
      interveningContradictionCount += 1;
    }
  }

  if (interveningContradictionCount > 0) {
    return {
      classification: 'STALE',
      reason: 'intervening_material_state_change',
      bridgeGapSeconds,
      interveningPrimarySampleCount: intervening.length,
      interveningContradictionCount,
      prePlateauStartAt: input.prePlateauStartAt ?? null,
      prePlateauEndAt: input.prePlateauEndAt,
      riseOnsetAt: input.riseOnsetAt,
    };
  }

  if (intervening.length > 0 && bridgeGapSeconds > maxBridgeSeconds) {
    return {
      classification: 'STALE',
      reason: 'pre_to_rise_bridge_exceeds_continuity_with_intervening_samples',
      bridgeGapSeconds,
      interveningPrimarySampleCount: intervening.length,
      interveningContradictionCount: 0,
      prePlateauStartAt: input.prePlateauStartAt ?? null,
      prePlateauEndAt: input.prePlateauEndAt,
      riseOnsetAt: input.riseOnsetAt,
    };
  }

  if (intervening.length === 0 && bridgeGapSeconds > maxBridgeSeconds) {
    return {
      classification: 'INSUFFICIENT_EVIDENCE',
      reason: 'pre_to_rise_silent_bridge_exceeds_continuity_without_intervening_samples',
      bridgeGapSeconds,
      interveningPrimarySampleCount: 0,
      interveningContradictionCount: 0,
      prePlateauStartAt: input.prePlateauStartAt ?? null,
      prePlateauEndAt: input.prePlateauEndAt,
      riseOnsetAt: input.riseOnsetAt,
    };
  }

  return {
    classification: 'FRESH',
    reason: 'pre_plateau_recent_for_rise',
    bridgeGapSeconds,
    interveningPrimarySampleCount: intervening.length,
    interveningContradictionCount: 0,
    prePlateauStartAt: input.prePlateauStartAt ?? null,
    prePlateauEndAt: input.prePlateauEndAt,
    riseOnsetAt: input.riseOnsetAt,
  };
}

export function buildBaselineRecencyEvidenceMeta(
  evaluation: RawFuelPrePlateauBaselineRecencyEvaluation,
): Record<string, unknown> {
  return {
    prePlateauStartAt: evaluation.prePlateauStartAt?.toISOString() ?? null,
    prePlateauEndAt: evaluation.prePlateauEndAt?.toISOString() ?? null,
    riseOnsetAt: evaluation.riseOnsetAt?.toISOString() ?? null,
    preToRiseBridgeGapSeconds: evaluation.bridgeGapSeconds,
    baselineRecencyClassification: evaluation.classification,
    baselineRecencyReason: evaluation.reason,
    interveningPrimarySampleCount: evaluation.interveningPrimarySampleCount,
    interveningContradictionCount: evaluation.interveningContradictionCount,
    baselineRecencyMaxBridgeSeconds: RFRF_BASELINE_RECENCY_MAX_BRIDGE_SECONDS,
  };
}

export const BASELINE_RECENCY_EVIDENCE_META_KEY = 'baselineRecency';

export function readBaselineRecencyFromEvidenceMeta(
  evidenceMeta: unknown,
): RawFuelPrePlateauBaselineRecencyClassification | null {
  if (!evidenceMeta || typeof evidenceMeta !== 'object' || Array.isArray(evidenceMeta)) {
    return null;
  }
  const root = evidenceMeta as Record<string, unknown>;
  const block = root[BASELINE_RECENCY_EVIDENCE_META_KEY];
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    const legacy = root.baselineRecencyClassification;
    if (legacy === 'FRESH' || legacy === 'STALE' || legacy === 'INSUFFICIENT_EVIDENCE') {
      return legacy;
    }
    return null;
  }
  const classification = (block as Record<string, unknown>).baselineRecencyClassification;
  if (
    classification === 'FRESH' ||
    classification === 'STALE' ||
    classification === 'INSUFFICIENT_EVIDENCE'
  ) {
    return classification;
  }
  return null;
}
