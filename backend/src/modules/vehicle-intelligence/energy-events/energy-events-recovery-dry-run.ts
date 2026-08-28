import { DIMO_ENERGY_DETECTOR_CONFIG_VERSION } from '@modules/dimo/energy-events/dimo-energy-detector.config';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  buildUpsertPayload,
  coalesceSegments,
  collectReplaceableSubSegmentIds,
  isMateriallyIdentical,
  isSegmentPersistable,
  type CoalescedEnergySegment,
} from './energy-events.pipeline';
import {
  assessPlausibilityFlags,
  detectOverlappingDuplicates,
} from './energy-events-plausibility';
import type {
  EnergyRecoveryCandidate,
  EnergyRecoveryClassification,
  EnergyRecoverySimulateInput,
} from './energy-events-recovery.types';

export interface SimulateRecoveryWindowResult {
  candidates: EnergyRecoveryCandidate[];
  skippedNotPersistable: number;
  legacySubsegmentsWouldReplace: string[];
  fetchFailed: boolean;
}

export function simulateRecoveryWindow(
  input: EnergyRecoverySimulateInput,
): SimulateRecoveryWindowResult {
  const candidates: EnergyRecoveryCandidate[] = [];
  const existingByDimoId = new Map(
    input.existingEvents.map((row) => [row.dimoSegmentId, row]),
  );

  const failedOutcomes = input.mechanismOutcomes.filter(
    (outcome) => outcome.status === 'FAILED',
  );
  const successfulMechanisms = new Set(
    input.mechanismOutcomes
      .filter((outcome) => outcome.status !== 'FAILED')
      .map((outcome) => outcome.mechanism),
  );

  for (const outcome of failedOutcomes) {
    candidates.push(buildFetchFailedCandidate(input, outcome));
  }

  const successfulSegments = input.segments.filter((segment) =>
    successfulMechanisms.has(segment.mechanism),
  );

  const persistable = successfulSegments.filter(isSegmentPersistable);
  const skippedNotPersistable = successfulSegments.length - persistable.length;

  for (const segment of successfulSegments.filter((s) => !isSegmentPersistable(s))) {
    candidates.push(
      buildSegmentCandidate(input, segment, 'WOULD_SKIP_NOT_PERSISTABLE', [], null),
    );
  }

  const coalesced = coalesceSegments(persistable);
  const replaceableIds = collectReplaceableSubSegmentIds(
    coalesced,
    input.mechanismOutcomes,
  );
  const overlapIds = detectOverlappingDuplicates(successfulSegments);

  for (const group of coalesced) {
    const payload = buildUpsertPayload(input.vehicleId, group);
    const existing = existingByDimoId.get(group.coalescedSegmentId) ?? null;
    const plausibility = assessPlausibilityFlags(group);
    if (overlapIds.has(group.segmentId)) {
      plausibility.push('overlapping_duplicate_session');
    }

    let classification: EnergyRecoveryClassification;
    if (plausibility.length > 0) {
      classification = 'MANUAL_REVIEW_REQUIRED';
    } else if (!existing) {
      classification = 'WOULD_CREATE';
    } else if (isMateriallyIdentical(existing, payload)) {
      classification = 'ALREADY_IDENTICAL';
    } else {
      classification = 'WOULD_UPDATE';
    }

    candidates.push(
      buildSegmentCandidate(
        input,
        group,
        classification,
        plausibility,
        existing?.id ?? null,
      ),
    );
  }

  const legacySubsegmentsWouldReplace = [...replaceableIds].filter((id) =>
    existingByDimoId.has(id),
  );

  for (const subId of legacySubsegmentsWouldReplace) {
    const existing = existingByDimoId.get(subId)!;
    candidates.push({
      classification: 'WOULD_REPLACE_LEGACY_SUBSEGMENTS',
      mechanism:
        existing.kind === 'REFUEL' ? 'refuel' : 'recharge',
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
      label: input.label,
      dimoSegmentId: subId,
      coalescedFromSegmentIds: [subId],
      startTime: existing.startTime.toISOString(),
      endTime: existing.endTime.toISOString(),
      durationSeconds: 0,
      fuelDeltaLiters: existing.fuelDeltaLiters,
      fuelDeltaPercent: existing.fuelDeltaPercent,
      socDeltaPercent: existing.socDeltaPercent,
      energyDeltaKwh: existing.energyDeltaKwh,
      confidence: existing.confidence,
      detectorConfigVersion: input.detectorConfigVersion,
      manualReviewReasons: ['legacy_subsegment_superseded_by_coalesced'],
      existingRowId: existing.id,
      windowFrom: input.windowFrom.toISOString(),
      windowTo: input.windowTo.toISOString(),
    });
  }

  return {
    candidates,
    skippedNotPersistable,
    legacySubsegmentsWouldReplace,
    fetchFailed: failedOutcomes.length > 0,
  };
}

function buildFetchFailedCandidate(
  input: EnergyRecoverySimulateInput,
  outcome: EnergyMechanismFetchOutcome,
): EnergyRecoveryCandidate {
  return {
    classification: 'FETCH_FAILED',
    mechanism: outcome.mechanism,
    vehicleId: input.vehicleId,
    tokenId: input.tokenId,
    label: input.label,
    dimoSegmentId: `fetch-failed-${outcome.mechanism}-${input.windowFrom.getTime()}`,
    coalescedFromSegmentIds: [],
    startTime: input.windowFrom.toISOString(),
    endTime: input.windowTo.toISOString(),
    durationSeconds: 0,
    fuelDeltaLiters: null,
    fuelDeltaPercent: null,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    confidence: 'LOW',
    detectorConfigVersion: input.detectorConfigVersion,
    manualReviewReasons: [
      outcome.error?.httpStatus === 422
        ? 'dimo_http_422'
        : `dimo_fetch_failed_${outcome.error?.httpStatus ?? 'unknown'}`,
    ],
    existingRowId: null,
    windowFrom: input.windowFrom.toISOString(),
    windowTo: input.windowTo.toISOString(),
  };
}

function buildSegmentCandidate(
  input: EnergyRecoverySimulateInput,
  segment: DimoEnergyEventSegment | CoalescedEnergySegment,
  classification: EnergyRecoveryClassification,
  manualReviewReasons: string[],
  existingRowId: string | null,
): EnergyRecoveryCandidate {
  const coalescedSegmentId =
    'coalescedSegmentId' in segment ? segment.coalescedSegmentId : segment.segmentId;
  const coalescedFromSegmentIds =
    'coalescedFromSegmentIds' in segment
      ? segment.coalescedFromSegmentIds
      : [segment.segmentId];
  const payload = buildUpsertPayload(
    input.vehicleId,
    {
      ...segment,
      coalescedSegmentId,
      coalescedFromSegmentIds,
    } as CoalescedEnergySegment,
  );
  return {
    classification,
    mechanism: segment.mechanism,
    vehicleId: input.vehicleId,
    tokenId: input.tokenId,
    label: input.label,
    dimoSegmentId: coalescedSegmentId,
    coalescedFromSegmentIds,
    startTime: segment.startTime,
    endTime: segment.endTime ?? segment.startTime,
    durationSeconds: segment.durationSeconds,
    fuelDeltaLiters: segment.fuelDeltaLiters,
    fuelDeltaPercent: segment.fuelDeltaPercent,
    socDeltaPercent: segment.socDeltaPercent,
    energyDeltaKwh: segment.energyDeltaKwh,
    odometerStartKm: segment.odometerStartKm,
    odometerEndKm: segment.odometerEndKm,
    confidence: payload.confidence,
    detectorConfigVersion:
      input.detectorConfigVersion || DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
    manualReviewReasons,
    existingRowId,
    windowFrom: input.windowFrom.toISOString(),
    windowTo: input.windowTo.toISOString(),
    startedBeforeRange: segment.startedBeforeRange === true,
  };
}

export function summarizeClassifications(
  candidates: EnergyRecoveryCandidate[],
): Record<EnergyRecoveryClassification, number> {
  const summary: Record<EnergyRecoveryClassification, number> = {
    WOULD_CREATE: 0,
    WOULD_UPDATE: 0,
    ALREADY_IDENTICAL: 0,
    WOULD_SKIP_NOT_PERSISTABLE: 0,
    WOULD_REPLACE_LEGACY_SUBSEGMENTS: 0,
    MANUAL_REVIEW_REQUIRED: 0,
    FETCH_FAILED: 0,
  };
  for (const candidate of candidates) {
    summary[candidate.classification] += 1;
  }
  return summary;
}
