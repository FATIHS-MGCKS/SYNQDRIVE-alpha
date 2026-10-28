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
 * - UNKNOWN: `contract.persistence.eventRowContract` is present but not a recognised version — intensity
 *   consumption must fail closed (see `readPersistedMotionEventIntensityForPayload`).
 */
export const DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY = 'DI_V0_MOTION_CORE_EVENT_ROW_V1_BOUNDARY_ONLY';
export const DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY =
  'DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1';
/** Declared contract string is present but not recognised; do not consume `intensity` (fail closed). */
export const DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN = 'UNKNOWN';

/**
 * Fable B3: DS4 mean intensities are attenuated vs. reference (−0.13 … −0.55 m/s² on the four-drive set)
 * because of kernel differences. Persisted intensities may be used for ordinal/relative comparison and
 * evidence inspection only; never as physically validated absolute m/s² thresholds.
 */
export const DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY = 'ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED' as const;

/** Peak accelerations are intentionally never persisted: 1 s/2 s peaks are kernel-sensitive artefact amplifiers. */
export const DI_V0_MOTION_CORE_SHADOW_INTENSITY_EXCLUDED_FIELDS = ['peakAccel1sMps2', 'peakAccel2sMps2'] as const;

export const DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_SEMANTICS = 'OPAQUE_CLASSIFICATION_TOKENS' as const;

/**
 * PR-3+ consumers must treat `events[].flags` as opaque classification tokens only.
 * Do not parse flag strings to recover 1 s step accelerations, peaks or other kinematic magnitudes
 * (e.g. `SPIKE_BRACKET_PRE=…_POST=…` embeds step values for human review only).
 */
export const DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_CONSUMPTION_POLICY =
  'MUST_NOT_PARSE_FLAGS_FOR_ACCEL_OR_PEAK_VALUES' as const;

/**
 * `meanAccelMps2` is the positive secant magnitude over the label span: |Δv|/3.6/max(durationS,1) with
 * Δv from unrounded C4/C5.1 speeds. Direction (accel vs decel) is defined exclusively by `kind`, not sign.
 */
export const DI_V0_MOTION_CORE_SHADOW_MEAN_ACCEL_MPS2_SEMANTICS =
  'POSITIVE_SECANT_MAGNITUDE_DV_KMH_OVER_3_6_OVER_DURATION_S_DIRECTION_IN_KIND_ONLY' as const;

/**
 * Fraction of 1 Hz label slots in [startLabel,endLabel] that carry a usable speed sample (incl. repaired/synthetic).
 * Not threshold-coverage; not a quality statement.
 */
export const DI_V0_MOTION_CORE_SHADOW_COVERAGE_RATIO_SEMANTICS =
  'USABLE_SAMPLES_OVER_SPAN_PLUS_ONE_INCLUDING_REPAIRED_SYNTHETIC' as const;

export type DiV0MotionCoreShadowEventRowContractResolution =
  | typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY
  | typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY
  | typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN;

export type DiV0MotionCoreShadowPersistenceContract = {
  eventRowContract: typeof DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;
  intensityUsagePolicy: typeof DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY;
  intensityExcludedFields: readonly string[];
  /** Fable B3 attenuation note; informational for reviewers and downstream shadow consumers. */
  intensityAttenuationNote: string;
  meanAccelMps2Semantics: typeof DI_V0_MOTION_CORE_SHADOW_MEAN_ACCEL_MPS2_SEMANTICS;
  coverageRatioSemantics: typeof DI_V0_MOTION_CORE_SHADOW_COVERAGE_RATIO_SEMANTICS;
  eventFlagsSemantics: typeof DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_SEMANTICS;
  eventFlagsConsumptionPolicy: typeof DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_CONSUMPTION_POLICY;
};

export const DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2: DiV0MotionCoreShadowPersistenceContract = {
  eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  intensityUsagePolicy: DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY,
  intensityExcludedFields: DI_V0_MOTION_CORE_SHADOW_INTENSITY_EXCLUDED_FIELDS,
  intensityAttenuationNote:
    'Fable B3: meanAccelMps2 systematically attenuated vs reference (3 s C4/C5.1 kernel); ordinal/relative use only within one speed authority and quality class; no absolute m/s² thresholds.',
  meanAccelMps2Semantics: DI_V0_MOTION_CORE_SHADOW_MEAN_ACCEL_MPS2_SEMANTICS,
  coverageRatioSemantics: DI_V0_MOTION_CORE_SHADOW_COVERAGE_RATIO_SEMANTICS,
  eventFlagsSemantics: DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_SEMANTICS,
  eventFlagsConsumptionPolicy: DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_CONSUMPTION_POLICY,
};

/** Already-computed detector intensity metadata (`MotionManoeuvreEvent`), persisted verbatim when reliable. */
export type DiV0MotionCoreShadowPersistedEventIntensityV1 = {
  /** Positive secant magnitude; direction in `kind` only. Ordinal use only (see intensityUsagePolicy). */
  meanAccelMps2: number;
  durationS: number;
  steps: number;
  /** Usable samples / (span + 1); open interval (0, 1]. */
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

/** Valid coverageRatio for persistence: strictly between 0 and 1 inclusive upper bound. */
function isValidCoverageRatio(value: number): boolean {
  return value > 0 && value <= 1;
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
  if (!isFiniteNumber(row.meanAccelMps2) || row.meanAccelMps2 <= 0) return undefined;
  if (!isFiniteNumber(row.durationS) || row.durationS < 0) return undefined;
  if (!isFiniteNumber(row.steps) || !Number.isInteger(row.steps) || row.steps < 0) return undefined;
  if (!isFiniteNumber(row.coverageRatio) || !isValidCoverageRatio(row.coverageRatio)) return undefined;
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

/**
 * Resolves the event-row contract of a decoded payload.
 * - No `contract.persistence` → V1 legacy (implicit boundary-only rows).
 * - Recognised V2 string → V2.
 * - Any other declared string (including future versions) → UNKNOWN (fail closed for intensity consumption).
 */
export function resolveMotionCoreShadowEventRowContract(payload: {
  contract?: { persistence?: { eventRowContract?: unknown } | null } | null;
}): DiV0MotionCoreShadowEventRowContractResolution {
  const declared = payload?.contract?.persistence?.eventRowContract;
  if (declared === undefined || declared === null) {
    if (payload?.contract?.persistence == null) {
      return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY;
    }
    return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN;
  }
  if (declared === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY) {
    return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;
  }
  if (declared === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY) {
    return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY;
  }
  return DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN;
}

export function isMotionCoreShadowIntensityConsumptionAllowed(
  contract: DiV0MotionCoreShadowEventRowContractResolution,
): boolean {
  return contract === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY;
}

/**
 * Validates and returns a persisted `intensity` block when present on the row.
 * Does not inspect payload contract — use `readPersistedMotionEventIntensityForPayload` for consumption.
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

/**
 * Fail-closed intensity reader for assessment/materializer consumers (PR-3+).
 * Returns `null` for V1 legacy, UNKNOWN/future contract versions, missing blocks and invalid blocks.
 */
export function readPersistedMotionEventIntensityForPayload(
  payload: { contract?: { persistence?: { eventRowContract?: unknown } | null } | null },
  row: { intensity?: Partial<DiV0MotionCoreShadowPersistedEventIntensityV1> | null },
): DiV0MotionCoreShadowPersistedEventIntensityV1 | null {
  const contract = resolveMotionCoreShadowEventRowContract(payload);
  if (!isMotionCoreShadowIntensityConsumptionAllowed(contract)) {
    return null;
  }
  return readPersistedMotionEventIntensity(row);
}
