import type { MotionManoeuvreEvent } from '../core/kinematics/motion-event.types';

/**
 * Persisted event-row contract for `di_v0_motion_core_shadow_runs_v1.payload_gzip` → `events[]`.
 *
 * The contract is versioned independently from the algorithm bundle (`contract.algorithmVersions.bundle`):
 * the bundle identifies the detection stack and drives the outbox intent key; the event-row contract
 * identifies the persisted row shape. Bumping the row contract therefore does not re-enqueue trips.
 *
 * - V1 (legacy, implicit): kind, boundaries, speeds, delta, quality, flags only. Payloads written before
 *   this contract existed carry no `contract.persistence` block and are resolved as V1.
 * - V2: V1 + optional `intensity` block with the detector's already-computed ordinal intensity metadata.
 */
export const DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY = 'DI_V0_MOTION_CORE_EVENT_ROW_V1_BOUNDARY_ONLY';
export const DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY =
  'DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1';

/**
 * Fable B3: DS4 mean intensities are attenuated vs. reference (−0.13 … −0.55 m/s² on the four-drive set)
 * because of kernel differences. Persisted intensities may be used for ordinal/relative comparison and
 * evidence inspection only; never as physically validated absolute m/s² thresholds.
 */
export const DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY = 'ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED' as const;

/** Peak accelerations are intentionally never persisted: 1 s/2 s peaks are kernel-sensitive artefact amplifiers. */
export const DI_V0_MOTION_CORE_SHADOW_INTENSITY_EXCLUDED_FIELDS = ['peakAccel1sMps2', 'peakAccel2sMps2'] as const;

export type DiV0MotionCoreShadowEventRowContractVersion =
  | typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY
  | typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;

export type DiV0MotionCoreShadowPersistenceContract = {
  eventRowContract: typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;
  intensityUsagePolicy: typeof DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY;
  intensityExcludedFields: readonly string[];
  /** Fable B3 attenuation note; informational for reviewers and downstream shadow consumers. */
  intensityAttenuationNote: string;
};

export const DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2: DiV0MotionCoreShadowPersistenceContract = {
  eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  intensityUsagePolicy: DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY,
  intensityExcludedFields: DI_V0_MOTION_CORE_SHADOW_INTENSITY_EXCLUDED_FIELDS,
  intensityAttenuationNote:
    'Fable B3: meanAccelMps2 systematically attenuated vs reference (3 s kernel); ordinal use only, no absolute thresholds.',
};

/** Already-computed detector intensity metadata (`MotionManoeuvreEvent`), persisted verbatim when reliable. */
export type DiV0MotionCoreShadowPersistedEventIntensityV1 = {
  meanAccelMps2: number;
  durationS: number;
  steps: number;
  coverageRatio: number;
  startUncertaintyS: string;
  endUncertaintyS: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Maps detector intensity to the persisted block. Returns `undefined` (field omitted, never zero-filled)
 * when any constituent is missing or non-finite, so a reader can distinguish "not reliable" from "zero".
 */
export function mapMotionManoeuvreEventIntensity(
  row: Pick<
    MotionManoeuvreEvent,
    'meanAccelMps2' | 'durationS' | 'steps' | 'coverageRatio' | 'startUncertaintyS' | 'endUncertaintyS'
  >,
): DiV0MotionCoreShadowPersistedEventIntensityV1 | undefined {
  if (!isFiniteNumber(row.meanAccelMps2)) return undefined;
  if (!isFiniteNumber(row.durationS) || row.durationS < 0) return undefined;
  if (!isFiniteNumber(row.steps) || !Number.isInteger(row.steps) || row.steps < 0) return undefined;
  if (!isFiniteNumber(row.coverageRatio) || row.coverageRatio < 0) return undefined;
  if (!isNonEmptyString(row.startUncertaintyS) || !isNonEmptyString(row.endUncertaintyS)) return undefined;
  return {
    meanAccelMps2: row.meanAccelMps2,
    durationS: row.durationS,
    steps: row.steps,
    coverageRatio: row.coverageRatio,
    startUncertaintyS: row.startUncertaintyS,
    endUncertaintyS: row.endUncertaintyS,
  };
}

/** Resolves the event-row contract of a decoded payload; legacy payloads have no `contract.persistence`. */
export function resolveMotionCoreShadowEventRowContract(payload: {
  contract?: { persistence?: { eventRowContract?: unknown } | null } | null;
}): DiV0MotionCoreShadowEventRowContractVersion {
  const declared = payload?.contract?.persistence?.eventRowContract;
  if (declared === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY) {
    return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;
  }
  return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY;
}

/**
 * Backward-compatible intensity reader: returns `null` for legacy rows, rows without a reliable block,
 * or rows whose block fails validation. Never synthesizes values.
 */
export function readPersistedMotionEventIntensity(row: {
  intensity?: Partial<DiV0MotionCoreShadowPersistedEventIntensityV1> | null;
}): DiV0MotionCoreShadowPersistedEventIntensityV1 | null {
  const block = row?.intensity;
  if (!block) return null;
  const mapped = mapMotionManoeuvreEventIntensity({
    meanAccelMps2: block.meanAccelMps2 as number,
    durationS: block.durationS as number,
    steps: block.steps as number,
    coverageRatio: block.coverageRatio as number,
    startUncertaintyS: block.startUncertaintyS as string,
    endUncertaintyS: block.endUncertaintyS as string,
  });
  return mapped ?? null;
}
