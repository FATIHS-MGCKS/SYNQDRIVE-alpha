import { parseBucketLabelMs } from '../core/kinematics/motion-core-grid';
import { MOTION_CORE_EVENT_GUARDS_V0_1_DEV } from '../core/kinematics/motion-event-detector';
import type {
  DiV0MotionCoreShadowPayloadV1,
  DiV0MotionCoreShadowPersistedFsmRow,
  DiV0MotionCoreShadowPersistedSpeedRow,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4SpeedAuthorityPartitionV1 } from './ds4-trip-assessment-v1.contract';

export const DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V1 = 'DS4_ASSESSMENT_DRIVING_EXPOSURE_V1' as const;

/** Maximum forward gap between consecutive speed labels included in exposure integration. */
export const DS4_ASSESSMENT_DRIVING_EXPOSURE_MAX_INTERVAL_GAP_S =
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV.maxGapS;

export type Ds4DrivingExposureProvenanceV1 = {
  provenanceVersion: typeof DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  speedSeriesField: 'speeds' | 'c4Speeds';
  speedSeriesEstimator: string | null;
  fsmMovingDirectLabelCount: number;
  usableSpeedLabelCount: number;
  qualifyingIntervalCount: number;
  excludedGapIntervalCount: number;
  maxObservedIntervalGapS: number;
  speedLabelCount: number;
};

export type Ds4DrivingExposureV1 = {
  exposureSeconds: number;
  distanceKm: number;
  derivable: boolean;
  provenance: Ds4DrivingExposureProvenanceV1;
};

const usableSpeedQualities = new Set<string>(MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities);

function resolveSpeedSeries(payload: DiV0MotionCoreShadowPayloadV1): {
  rows: DiV0MotionCoreShadowPersistedSpeedRow[];
  field: 'speeds' | 'c4Speeds';
} {
  const preferred = payload.speeds ?? [];
  if (preferred.length > 0) {
    return { rows: [...preferred].sort((a, b) => a.bucketLabelUtc.localeCompare(b.bucketLabelUtc)), field: 'speeds' };
  }
  const c4 = payload.c4Speeds ?? [];
  return { rows: [...c4].sort((a, b) => a.bucketLabelUtc.localeCompare(b.bucketLabelUtc)), field: 'c4Speeds' };
}

function fsmByLabel(fsmLabels: DiV0MotionCoreShadowPersistedFsmRow[]): Map<string, DiV0MotionCoreShadowPersistedFsmRow> {
  const map = new Map<string, DiV0MotionCoreShadowPersistedFsmRow>();
  for (const row of fsmLabels ?? []) {
    map.set(row.bucketLabelUtc, row);
  }
  return map;
}

function isUsableNumericSpeed(row: DiV0MotionCoreShadowPersistedSpeedRow): boolean {
  if (row.speedKmh == null || !Number.isFinite(row.speedKmh) || row.speedKmh < 0) {
    return false;
  }
  return usableSpeedQualities.has(String(row.quality));
}

function qualifiesExposureSample(
  speedRow: DiV0MotionCoreShadowPersistedSpeedRow,
  fsm: DiV0MotionCoreShadowPersistedFsmRow | undefined,
): boolean {
  if (!isUsableNumericSpeed(speedRow)) {
    return false;
  }
  if (!fsm) {
    return false;
  }
  return fsm.state === 'MOVING' && fsm.evidenceQuality === 'DIRECT';
}

export function emptyDs4DrivingExposureV1(speedAuthority: Ds4SpeedAuthorityPartitionV1 | null = null): Ds4DrivingExposureV1 {
  return {
    exposureSeconds: 0,
    distanceKm: 0,
    derivable: false,
    provenance: {
      provenanceVersion: DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V1,
      speedAuthority,
      speedSeriesField: 'speeds',
      speedSeriesEstimator: null,
      fsmMovingDirectLabelCount: 0,
      usableSpeedLabelCount: 0,
      qualifyingIntervalCount: 0,
      excludedGapIntervalCount: 0,
      maxObservedIntervalGapS: 0,
      speedLabelCount: 0,
    },
  };
}

export function deriveDs4DrivingExposureV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): Ds4DrivingExposureV1 {
  const { rows, field } = resolveSpeedSeries(input.payload);
  const fsmMap = fsmByLabel(input.payload.fsmLabels ?? []);

  let fsmMovingDirectLabelCount = 0;
  let usableSpeedLabelCount = 0;
  let qualifyingIntervalCount = 0;
  let excludedGapIntervalCount = 0;
  let maxObservedIntervalGapS = 0;
  let exposureSeconds = 0;
  let distanceKm = 0;

  for (const row of rows) {
    const fsm = fsmMap.get(row.bucketLabelUtc);
    if (fsm?.state === 'MOVING' && fsm.evidenceQuality === 'DIRECT') {
      fsmMovingDirectLabelCount += 1;
    }
    if (isUsableNumericSpeed(row)) {
      usableSpeedLabelCount += 1;
    }
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const current = rows[i]!;
    const next = rows[i + 1]!;
    const dtS = (parseBucketLabelMs(next.bucketLabelUtc) - parseBucketLabelMs(current.bucketLabelUtc)) / 1000;
    if (dtS <= 0) {
      continue;
    }
    maxObservedIntervalGapS = Math.max(maxObservedIntervalGapS, dtS);
    if (dtS > DS4_ASSESSMENT_DRIVING_EXPOSURE_MAX_INTERVAL_GAP_S) {
      excludedGapIntervalCount += 1;
      continue;
    }
    if (!qualifiesExposureSample(current, fsmMap.get(current.bucketLabelUtc))) {
      continue;
    }
    const speedKmh = current.speedKmh!;
    qualifyingIntervalCount += 1;
    exposureSeconds += dtS;
    distanceKm += (speedKmh * dtS) / 3600;
  }

  const derivable = rows.length >= 2 && input.speedAuthority != null;
  const estimator = rows[0]?.estimator ?? null;

  return {
    exposureSeconds: derivable ? exposureSeconds : 0,
    distanceKm: derivable ? distanceKm : 0,
    derivable,
    provenance: {
      provenanceVersion: DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V1,
      speedAuthority: input.speedAuthority,
      speedSeriesField: field,
      speedSeriesEstimator: estimator,
      fsmMovingDirectLabelCount,
      usableSpeedLabelCount,
      qualifyingIntervalCount,
      excludedGapIntervalCount,
      maxObservedIntervalGapS,
      speedLabelCount: rows.length,
    },
  };
}
