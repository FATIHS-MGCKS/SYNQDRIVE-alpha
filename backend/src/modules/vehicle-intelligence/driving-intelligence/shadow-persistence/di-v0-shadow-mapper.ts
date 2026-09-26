import type { DiV0IntervalSpeedResult, DiV0TripComputeOutput } from '../core/types';
import type { DiV0VersionTuple } from '../core/versions';
import type { DiV0ShadowPersistedIntervalInput } from './di-v0-shadow-types';
import { validateShadowIntervalRow } from './di-v0-shadow-validation';

function parseIso(iso: string): Date {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`DI_V0_SHADOW_INVALID_ISO: ${iso}`);
  }
  return new Date(ms);
}

export function mapIntervalResultToPersistRow(
  interval: DiV0IntervalSpeedResult,
  versions: DiV0VersionTuple,
): DiV0ShadowPersistedIntervalInput {
  const row: DiV0ShadowPersistedIntervalInput = {
    intervalStart: parseIso(interval.intervalStart),
    intervalEnd: parseIso(interval.intervalEnd),
    referenceTime: parseIso(interval.referenceTime),
    motionState: interval.motionState,
    positionState: interval.positionState,
    causalPositionState: interval.causalPositionState,
    estimatedSpeedKmh: interval.estimatedSpeedKmh,
    speedRangeMinKmh: interval.speedRangeKmh?.[0] ?? null,
    speedRangeMaxKmh: interval.speedRangeKmh?.[1] ?? null,
    speedEvidenceState: interval.speedEvidenceState,
    temporalConfidence: interval.temporalConfidence,
    valueConfidence: interval.valueConfidence,
    sourceRelation: interval.sourceRelation,
    claimLevel: interval.claimLevel,
    abstentionReason: interval.abstentionReason,
    evidenceSources: [...interval.evidenceSources],
    sourceQualityFlags: [...interval.sourceQualityFlags],
    supportIntervalStart: interval.provenance.supportIntervalStart
      ? parseIso(interval.provenance.supportIntervalStart)
      : null,
    supportIntervalEnd: interval.provenance.supportIntervalEnd
      ? parseIso(interval.provenance.supportIntervalEnd)
      : null,
    derivationMethod: interval.provenance.derivationMethod,
    derivationVersion: interval.provenance.derivationVersion,
    provenance: interval.provenance as unknown as Record<string, unknown>,
    legacyComparison: null,
  };
  validateShadowIntervalRow(row);
  return row;
}

export function mapComputeOutputToPersistRows(
  output: DiV0TripComputeOutput,
  versions: DiV0VersionTuple,
): DiV0ShadowPersistedIntervalInput[] {
  return output.intervals.map((interval) => mapIntervalResultToPersistRow(interval, versions));
}

export { deriveCompletionCountsFromRows as deriveCompletionCounts } from './di-v0-shadow-completion';
