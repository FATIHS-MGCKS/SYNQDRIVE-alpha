import type { DiV0CalibrationBundle } from '../calibration/types';
import { haversineMeters, isValidLatLon } from '../geo/haversine';
import type {
  EvidenceAvailability,
  NormalizedPositionObservation,
  PositionState,
  StructuralGridPositionFlag,
} from '../types';
import { coordsEqual, coordKey } from './coord-key';

export interface ClassifiedPositionRow {
  observation: NormalizedPositionObservation;
  positionState: PositionState;
  causalPositionState: PositionState;
  gridFlag: StructuralGridPositionFlag | null;
  holdRunId: number | null;
  releaseOfHoldRunId: number | null;
  coord: { latitude: number; longitude: number } | null;
  coordKey: string | null;
  rowGapSeconds: number;
}

export interface HoldRun {
  id: number;
  labelIndices: number[];
  startLabel: string;
  endLabel: string;
  releaseIndex: number | null;
  releaseDisplacementM: number | null;
  holdDurationSeconds: number;
}

function parseLabelMs(label: string): number {
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid bucketLabel: ${label}`);
  }
  return ms;
}

function resolveCoord(obs: NormalizedPositionObservation): { latitude: number; longitude: number } | null {
  if (obs.availability !== 'PRESENT') {
    return null;
  }
  if (obs.latitude == null || obs.longitude == null) {
    return null;
  }
  if (!isValidLatLon(obs.latitude, obs.longitude)) {
    return null;
  }
  return { latitude: obs.latitude, longitude: obs.longitude };
}

/**
 * Deterministic hold/release classification over densified position rows (sorted by bucketLabel).
 * Causal states treat in-hold rows as FROZEN_UNRESOLVED until release is observed.
 */
export function classifyPositionRows(
  positions: NormalizedPositionObservation[],
  calibration: DiV0CalibrationBundle,
): ClassifiedPositionRow[] {
  const sorted = [...positions].sort((a, b) => a.bucketLabel.localeCompare(b.bucketLabel));
  const labelCounts = new Map<string, number>();
  for (const obs of sorted) {
    labelCounts.set(obs.bucketLabel, (labelCounts.get(obs.bucketLabel) ?? 0) + 1);
  }
  const duplicateBucketLabels = new Set(
    [...labelCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label),
  );
  const rows: ClassifiedPositionRow[] = sorted.map((obs, idx) => {
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const gap =
      prev == null
        ? 0
        : Math.max(0, Math.round((parseLabelMs(obs.bucketLabel) - parseLabelMs(prev.bucketLabel)) / 1000) - 1);
    const coord = resolveCoord(obs);
    return {
      observation: obs,
      positionState: obs.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : obs.availability === 'SIGNAL_NULL' ? 'SIGNAL_NULL' : 'FRESH',
      causalPositionState:
        obs.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : obs.availability === 'SIGNAL_NULL' ? 'SIGNAL_NULL' : 'FRESH',
      gridFlag: duplicateBucketLabels.has(obs.bucketLabel) ? 'DUPLICATE_BUCKET_LABEL' : null,
      holdRunId: null,
      releaseOfHoldRunId: null,
      coord,
      coordKey: coord ? coordKey(coord.latitude, coord.longitude) : null,
      rowGapSeconds: gap,
    };
  });

  const presentIndices = rows
    .map((r, i) => (r.coord != null ? i : -1))
    .filter((i) => i >= 0);

  const holdRuns: HoldRun[] = [];
  let runId = 0;
  let i = 0;
  while (i < presentIndices.length) {
    const startIdx = presentIndices[i];
    const startCoord = rows[startIdx].coord!;
    let j = i;
    while (j + 1 < presentIndices.length) {
      const nextIdx = presentIndices[j + 1];
      const prevIdx = presentIndices[j];
      const labelGap = parseLabelMs(rows[nextIdx].observation.bucketLabel) - parseLabelMs(rows[prevIdx].observation.bucketLabel);
      if (labelGap !== 1000) {
        break;
      }
      const nextCoord = rows[nextIdx].coord!;
      if (!coordsEqual(startCoord, nextCoord)) {
        break;
      }
      j++;
    }
    if (j > i) {
      runId += 1;
      const indices = presentIndices.slice(i, j + 1);
      const startLabel = rows[indices[0]].observation.bucketLabel;
      const endLabel = rows[indices[indices.length - 1]].observation.bucketLabel;
      const releaseIndex =
        indices[indices.length - 1] + 1 < rows.length && rows[indices[indices.length - 1] + 1].coord != null
          ? indices[indices.length - 1] + 1
          : null;
      let releaseDisplacementM: number | null = null;
      if (releaseIndex != null) {
        const releaseCoord = rows[releaseIndex].coord!;
        releaseDisplacementM = haversineMeters(
          startCoord.latitude,
          startCoord.longitude,
          releaseCoord.latitude,
          releaseCoord.longitude,
        );
      }
      const holdDurationSeconds =
        (parseLabelMs(endLabel) - parseLabelMs(startLabel)) / 1000 + 1;
      holdRuns.push({
        id: runId,
        labelIndices: indices,
        startLabel,
        endLabel,
        releaseIndex,
        releaseDisplacementM,
        holdDurationSeconds,
      });
      for (const idx of indices) {
        rows[idx].holdRunId = runId;
        rows[idx].positionState = 'FROZEN_UNRESOLVED';
        rows[idx].causalPositionState = 'FROZEN_UNRESOLVED';
      }
      if (releaseIndex != null) {
        rows[releaseIndex].releaseOfHoldRunId = runId;
        rows[releaseIndex].positionState = 'RELEASE';
        rows[releaseIndex].causalPositionState = 'RELEASE';
      }
      i = j + 1;
      continue;
    }
    i += 1;
  }

  for (const run of holdRuns) {
    classifyFrozenRun(run, rows, calibration);
  }

  for (let n = 0; n < rows.length; n++) {
    const row = rows[n];
    if (row.positionState !== 'FRESH' && row.positionState !== 'SIGNAL_NULL' && row.positionState !== 'ROW_ABSENT') {
      continue;
    }
    if (row.observation.availability === 'ROW_ABSENT') {
      row.positionState = 'ROW_ABSENT';
      row.causalPositionState = 'ROW_ABSENT';
      continue;
    }
    if (row.observation.availability === 'SIGNAL_NULL') {
      row.positionState = 'SIGNAL_NULL';
      row.causalPositionState = 'SIGNAL_NULL';
      continue;
    }
    if (row.releaseOfHoldRunId != null) {
      continue;
    }
    // After ROW_ABSENT gaps in a densified grid (C1D.4); trip-start labels remain FRESH.
    if (row.rowGapSeconds > 0) {
      row.gridFlag = 'FIRST_OR_AFTER_ROW_GAP';
    }
  }

  return rows;
}

function classifyFrozenRun(
  run: HoldRun,
  rows: ClassifiedPositionRow[],
  calibration: DiV0CalibrationBundle,
): void {
  const displacement = run.releaseDisplacementM;
  if (displacement == null) {
    return;
  }
  let frozenState: PositionState = 'FROZEN_UNRESOLVED';
  if (displacement <= calibration.holdNoiseDisplacementM) {
    frozenState = 'FROZEN_STOP_SUPPORTED';
  } else {
    const spanSeconds =
      run.releaseIndex != null
        ? (parseLabelMs(rows[run.releaseIndex].observation.bucketLabel) - parseLabelMs(run.startLabel)) / 1000
        : run.holdDurationSeconds;
    const impliedKmh = spanSeconds > 0 ? (displacement / spanSeconds) * 3.6 : null;
    if (impliedKmh != null && impliedKmh >= calibration.holdMovementLowerBoundMinKmh) {
      frozenState = 'FROZEN_MOVEMENT_SUPPORTED';
    } else if (displacement <= calibration.holdNoiseDisplacementM * 3) {
      frozenState = 'FROZEN_STOP_SUPPORTED';
    }
  }
  for (const idx of run.labelIndices) {
    rows[idx].positionState = frozenState;
    rows[idx].causalPositionState = 'FROZEN_UNRESOLVED';
  }
}

export function labelIndexByBucket(rows: ClassifiedPositionRow[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((r, i) => map.set(r.observation.bucketLabel, i));
  return map;
}

export function isL3SupportPositionState(state: PositionState): boolean {
  return state === 'FRESH';
}

export function isFrozenPositionState(state: PositionState): boolean {
  return (
    state === 'FROZEN_UNRESOLVED' ||
    state === 'FROZEN_MOVEMENT_SUPPORTED' ||
    state === 'FROZEN_STOP_SUPPORTED'
  );
}

export function availabilityBlocksL3(availability: EvidenceAvailability): boolean {
  return availability === 'ROW_ABSENT' || availability === 'SIGNAL_NULL';
}
