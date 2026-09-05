/**
 * DI-EV-0035C.1c / C.1d — Single-drive multi-cadence Flight Recorder calibration.
 *
 * CONTROL-PLANE (calibration series / phases) is distinct from DATA-PLANE (watermarks).
 * Pending phase requests activate at acquisition-cycle release boundary only.
 */
import { randomUUID } from 'node:crypto';
import {
  clampHfPollIntervalMs,
  HF_POLL_CALIBRATION_CANDIDATES_MS,
  verifyNoUnqueriedGap,
} from './reference-capture-hf-block-polling.policy';
import {
  HF_RECOVERY_POLICY_V2_VERSION,
  type HfQueryProvenanceRecord,
  type HfRecoveryPolicyV2Config,
} from './reference-capture-hf-recovery-v2.policy';

export type HfCalibrationWindowClassification = 'PHASE_NATIVE' | 'TRANSITION_WINDOW';

export type HfCalibrationEffectiveConfigSnapshot = {
  calibrationSeriesId: string;
  calibrationPhaseId: string;
  phaseSequence: number;
  vehicleId: string;
  tokenId: number;
  effectivePollIntervalMs: number;
  settlementDelayMs: number;
  recoveryOverlapMs: number;
  policyVersion: string;
  policyMode: 'V2';
  effectiveAt: string;
};

export type HfCalibrationPhaseSummary = {
  calibrationPhaseId: string;
  phaseSequence: number;
  effectivePollIntervalMs: number;
  phaseStartedAt: string;
  phaseEndedAt: string;
  durationMs: number;
  effectiveConfig: HfCalibrationEffectiveConfigSnapshot;
  /** Primary FAST_LOOP + PHASE_NATIVE comparison metrics */
  providerRequestCount: number;
  providerSuccessCount: number;
  providerZeroResultCount: number;
  providerErrorCount: number;
  providerBucketCount: number;
  newBucketCount: number;
  duplicateBucketCount: number;
  revisionBucketCount: number;
  recoveredLateBucketCount: number;
  nativeUniqueTemporalBucketStartCount: number;
  nativeMaxTemporalGapMs: number | null;
  nativeMedianTemporalCadenceMs: number | null;
  nativeP90TemporalCadenceMs: number | null;
  maxIntraResponseTemporalGapMs: number | null;
  /** Diagnostic stratification */
  allRequestCount: number;
  transitionWindowCount: number;
  transitionProviderBucketCount: number;
  recoverySweepRequestCount: number;
  /** @deprecated use nativeUniqueTemporalBucketStartCount */
  uniqueTemporalBucketStartCount: number;
};

export type HfCalibrationPhaseRuntimeCounters = {
  calibrationPhaseId: string;
  allRequestCount: number;
  nativeFastLoopRequestCount: number;
  nativeFastLoopProviderSuccessCount: number;
  nativeFastLoopProviderZeroResultCount: number;
  nativeFastLoopProviderErrorCount: number;
  nativeFastLoopProviderBucketCount: number;
  nativeFastLoopNewBucketCount: number;
  nativeFastLoopDuplicateBucketCount: number;
  nativeFastLoopRevisionBucketCount: number;
  transitionRequestCount: number;
  transitionProviderBucketCount: number;
  recoverySweepRequestCount: number;
  recoveredLateBucketCount: number;
  transitionWindowCount: number;
  nativeUniqueTemporalBucketStarts: string[];
  nativeMaxIntraResponseTemporalGapMs: number | null;
};

export type HfCalibrationCancelledPhaseRequest = HfCalibrationPendingPhaseRequest & {
  cancelledAt: string;
  cancelReason: string;
  neverEffective: true;
};

export type HfCalibrationPendingPhaseRequest = {
  requestId: string;
  requestedAt: string;
  effectivePollIntervalMs: number;
};

export type HfCalibrationPhaseRecord = {
  calibrationPhaseId: string;
  phaseSequence: number;
  effectivePollIntervalMs: number;
  phaseStartedAt: string;
  phaseEndedAt: string | null;
  effectiveConfig?: HfCalibrationEffectiveConfigSnapshot;
};

export type HfCalibrationSeriesState = {
  calibrationSeriesId: string;
  vehicleId: string;
  tokenId: number;
  phaseOrder: number[];
  activePhase: HfCalibrationPhaseRecord | null;
  completedPhases: HfCalibrationPhaseRecord[];
  completedPhaseSummaries: HfCalibrationPhaseSummary[];
  pendingPhaseRequest: HfCalibrationPendingPhaseRequest | null;
  cancelledPhaseRequests?: HfCalibrationCancelledPhaseRequest[];
  terminalFinalizationAt: string | null;
  lastPhaseBoundaryAt: string | null;
  seriesStartedAt: string;
  controlPlaneRevision: number;
};

export type HfCalibrationPhaseContext = {
  calibrationSeriesId: string;
  calibrationPhaseId: string;
  phaseSequence: number;
  effectivePollIntervalMs: number;
  phaseStartedAt: string;
  phaseBoundaryAt: string | null;
  windowClassification: HfCalibrationWindowClassification;
};

export type HfCalibrationPhaseActivationStatus = 'REQUESTED' | 'EFFECTIVE';

export type HfCalibrationPhaseRequestResult = {
  series: HfCalibrationSeriesState;
  request: HfCalibrationPendingPhaseRequest;
  deduplicated: boolean;
  activationStatus: HfCalibrationPhaseActivationStatus;
  controlPlaneRevision: number;
};

export function normalizeHfCalibrationSeriesState(
  raw: Partial<HfCalibrationSeriesState> | null | undefined,
): HfCalibrationSeriesState | null {
  if (!raw?.calibrationSeriesId || !raw.vehicleId || raw.tokenId == null || !raw.seriesStartedAt) {
    return null;
  }
  return {
    calibrationSeriesId: raw.calibrationSeriesId,
    vehicleId: raw.vehicleId,
    tokenId: raw.tokenId,
    phaseOrder: [...(raw.phaseOrder ?? [])],
    activePhase: raw.activePhase ? { ...raw.activePhase } : null,
    completedPhases: (raw.completedPhases ?? []).map((p) => ({ ...p })),
    completedPhaseSummaries: (raw.completedPhaseSummaries ?? []).map((s) => ({ ...s })),
    pendingPhaseRequest: raw.pendingPhaseRequest ? { ...raw.pendingPhaseRequest } : null,
    cancelledPhaseRequests: (raw.cancelledPhaseRequests ?? []).map((c) => ({ ...c })),
    terminalFinalizationAt: raw.terminalFinalizationAt ?? null,
    lastPhaseBoundaryAt: raw.lastPhaseBoundaryAt ?? null,
    seriesStartedAt: raw.seriesStartedAt,
    controlPlaneRevision: raw.controlPlaneRevision ?? 0,
  };
}

export function assertHfCalibrationPhaseActivationAllowed(
  hfPolicy: HfRecoveryPolicyV2Config,
  hfPolicyBase: HfRecoveryPolicyV2Config,
): void {
  if (hfPolicy.mode !== 'V2') {
    throw new Error('HF calibration phase activation requires effective V2 policy for selected token');
  }
  if (hfPolicyBase.mode === 'V2' && hfPolicyBase.canaryOnly && hfPolicyBase.canaryTokenIds.length === 0) {
    throw new Error('HF calibration blocked: canary-only mode with empty allowlist (fail-closed)');
  }
}

export class HfCalibrationPhaseChangePendingError extends Error {
  readonly code = 'CALIBRATION_PHASE_CHANGE_PENDING';

  constructor(
    public readonly pendingIntervalMs: number,
    public readonly requestedIntervalMs: number,
  ) {
    super(
      `Calibration phase change already pending (${pendingIntervalMs}ms); cannot request ${requestedIntervalMs}ms`,
    );
    this.name = 'HfCalibrationPhaseChangePendingError';
  }
}

export function requestHfCalibrationPhase(args: {
  existing: HfCalibrationSeriesState | null;
  vehicleId: string;
  tokenId: number;
  effectivePollIntervalMs: number;
  nowMs: number;
  idFactory?: () => string;
}): {
  series: HfCalibrationSeriesState;
  request: HfCalibrationPendingPhaseRequest;
  deduplicated: boolean;
} {
  const intervalMs = clampHfPollIntervalMs(args.effectivePollIntervalMs);
  const newId = args.idFactory ?? randomUUID;
  const requestedAt = new Date(args.nowMs).toISOString();
  const request: HfCalibrationPendingPhaseRequest = {
    requestId: newId(),
    requestedAt,
    effectivePollIntervalMs: intervalMs,
  };

  if (args.existing?.activePhase?.effectivePollIntervalMs === intervalMs) {
    throw new Error(
      `Requested calibration phase ${intervalMs}ms matches current effective phase`,
    );
  }

  if (args.existing?.pendingPhaseRequest?.effectivePollIntervalMs === intervalMs) {
    return {
      series: args.existing,
      request: args.existing.pendingPhaseRequest,
      deduplicated: true,
    };
  }

  if (args.existing?.pendingPhaseRequest) {
    throw new HfCalibrationPhaseChangePendingError(
      args.existing.pendingPhaseRequest.effectivePollIntervalMs,
      intervalMs,
    );
  }

  const base: HfCalibrationSeriesState = args.existing ?? {
    calibrationSeriesId: newId(),
    vehicleId: args.vehicleId,
    tokenId: args.tokenId,
    phaseOrder: [],
    activePhase: null,
    completedPhases: [],
    completedPhaseSummaries: [],
    pendingPhaseRequest: null,
    cancelledPhaseRequests: [],
    terminalFinalizationAt: null,
    lastPhaseBoundaryAt: null,
    seriesStartedAt: requestedAt,
    controlPlaneRevision: 0,
  };

  const series: HfCalibrationSeriesState = {
    ...base,
    vehicleId: args.vehicleId,
    tokenId: args.tokenId,
    pendingPhaseRequest: request,
    controlPlaneRevision: base.controlPlaneRevision + 1,
  };

  return { series, request, deduplicated: false };
}

export function buildEffectiveConfigSnapshot(args: {
  series: HfCalibrationSeriesState;
  phase: HfCalibrationPhaseRecord;
  hfPolicy: HfRecoveryPolicyV2Config;
  effectiveAtMs: number;
}): HfCalibrationEffectiveConfigSnapshot {
  return {
    calibrationSeriesId: args.series.calibrationSeriesId,
    calibrationPhaseId: args.phase.calibrationPhaseId,
    phaseSequence: args.phase.phaseSequence,
    vehicleId: args.series.vehicleId,
    tokenId: args.series.tokenId,
    effectivePollIntervalMs: args.phase.effectivePollIntervalMs,
    settlementDelayMs: args.hfPolicy.settlementDelayMs,
    recoveryOverlapMs: args.hfPolicy.recoveryOverlapMs,
    policyVersion: HF_RECOVERY_POLICY_V2_VERSION,
    policyMode: 'V2',
    effectiveAt: new Date(args.effectiveAtMs).toISOString(),
  };
}

function emptyPhaseCounters(phaseId: string): HfCalibrationPhaseRuntimeCounters {
  return {
    calibrationPhaseId: phaseId,
    allRequestCount: 0,
    nativeFastLoopRequestCount: 0,
    nativeFastLoopProviderSuccessCount: 0,
    nativeFastLoopProviderZeroResultCount: 0,
    nativeFastLoopProviderErrorCount: 0,
    nativeFastLoopProviderBucketCount: 0,
    nativeFastLoopNewBucketCount: 0,
    nativeFastLoopDuplicateBucketCount: 0,
    nativeFastLoopRevisionBucketCount: 0,
    transitionRequestCount: 0,
    transitionProviderBucketCount: 0,
    recoverySweepRequestCount: 0,
    recoveredLateBucketCount: 0,
    transitionWindowCount: 0,
    nativeUniqueTemporalBucketStarts: [],
    nativeMaxIntraResponseTemporalGapMs: null,
  };
}

export function computeNativeTemporalCadenceStats(timestamps: string[]): {
  nativeUniqueTemporalBucketStartCount: number;
  nativeMaxTemporalGapMs: number | null;
  nativeMedianTemporalCadenceMs: number | null;
  nativeP90TemporalCadenceMs: number | null;
} {
  const sorted = [...new Set(timestamps)]
    .map((t) => Date.parse(t))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      nativeUniqueTemporalBucketStartCount: 0,
      nativeMaxTemporalGapMs: null,
      nativeMedianTemporalCadenceMs: null,
      nativeP90TemporalCadenceMs: null,
    };
  }
  if (sorted.length === 1) {
    return {
      nativeUniqueTemporalBucketStartCount: 1,
      nativeMaxTemporalGapMs: null,
      nativeMedianTemporalCadenceMs: null,
      nativeP90TemporalCadenceMs: null,
    };
  }
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const p90Idx = Math.min(sortedGaps.length - 1, Math.ceil(sortedGaps.length * 0.9) - 1);
  return {
    nativeUniqueTemporalBucketStartCount: sorted.length,
    nativeMaxTemporalGapMs: Math.max(...gaps),
    nativeMedianTemporalCadenceMs: median,
    nativeP90TemporalCadenceMs: sortedGaps[p90Idx],
  };
}

export function finalizePhaseSummary(args: {
  phase: HfCalibrationPhaseRecord;
  counters: HfCalibrationPhaseRuntimeCounters;
  phaseEndedAtMs: number;
}): HfCalibrationPhaseSummary {
  const startedMs = Date.parse(args.phase.phaseStartedAt);
  const endedMs = args.phaseEndedAtMs;
  const temporal = computeNativeTemporalCadenceStats(args.counters.nativeUniqueTemporalBucketStarts);
  return {
    calibrationPhaseId: args.phase.calibrationPhaseId,
    phaseSequence: args.phase.phaseSequence,
    effectivePollIntervalMs: args.phase.effectivePollIntervalMs,
    phaseStartedAt: args.phase.phaseStartedAt,
    phaseEndedAt: new Date(endedMs).toISOString(),
    durationMs: Number.isFinite(startedMs) ? Math.max(0, endedMs - startedMs) : 0,
    effectiveConfig: args.phase.effectiveConfig!,
    providerRequestCount: args.counters.nativeFastLoopRequestCount,
    providerSuccessCount: args.counters.nativeFastLoopProviderSuccessCount,
    providerZeroResultCount: args.counters.nativeFastLoopProviderZeroResultCount,
    providerErrorCount: args.counters.nativeFastLoopProviderErrorCount,
    providerBucketCount: args.counters.nativeFastLoopProviderBucketCount,
    newBucketCount: args.counters.nativeFastLoopNewBucketCount,
    duplicateBucketCount: args.counters.nativeFastLoopDuplicateBucketCount,
    revisionBucketCount: args.counters.nativeFastLoopRevisionBucketCount,
    recoveredLateBucketCount: args.counters.recoveredLateBucketCount,
    nativeUniqueTemporalBucketStartCount: temporal.nativeUniqueTemporalBucketStartCount,
    nativeMaxTemporalGapMs: temporal.nativeMaxTemporalGapMs,
    nativeMedianTemporalCadenceMs: temporal.nativeMedianTemporalCadenceMs,
    nativeP90TemporalCadenceMs: temporal.nativeP90TemporalCadenceMs,
    maxIntraResponseTemporalGapMs: args.counters.nativeMaxIntraResponseTemporalGapMs,
    allRequestCount: args.counters.allRequestCount,
    transitionWindowCount: args.counters.transitionWindowCount,
    transitionProviderBucketCount: args.counters.transitionProviderBucketCount,
    recoverySweepRequestCount: args.counters.recoverySweepRequestCount,
    uniqueTemporalBucketStartCount: temporal.nativeUniqueTemporalBucketStartCount,
  };
}

export type ApplyPendingCalibrationPhaseResult = {
  series: HfCalibrationSeriesState | null;
  applied: boolean;
  resetLastHfHistoricalPollAt: boolean;
  activePhaseCounters: HfCalibrationPhaseRuntimeCounters | null;
};

export function applyPendingCalibrationPhaseAtBoundary(args: {
  series: HfCalibrationSeriesState | null;
  pending: HfCalibrationPendingPhaseRequest | null;
  counters: HfCalibrationPhaseRuntimeCounters | null;
  hfPolicy: HfRecoveryPolicyV2Config;
  effectiveAtMs: number;
  idFactory?: () => string;
}): ApplyPendingCalibrationPhaseResult {
  if (!args.pending) {
    return {
      series: args.series,
      applied: false,
      resetLastHfHistoricalPollAt: false,
      activePhaseCounters: args.counters,
    };
  }

  const intervalMs = args.pending.effectivePollIntervalMs;
  const effectiveAtIso = new Date(args.effectiveAtMs).toISOString();
  const newId = args.idFactory ?? randomUUID;

  if (args.series?.activePhase?.effectivePollIntervalMs === intervalMs) {
    return {
      series: { ...args.series, pendingPhaseRequest: null },
      applied: false,
      resetLastHfHistoricalPollAt: false,
      activePhaseCounters: args.counters,
    };
  }

  let series = args.series;
  let completedPhases = [...(series?.completedPhases ?? [])];
  let completedSummaries = [...(series?.completedPhaseSummaries ?? [])];
  let counters = args.counters;

  if (series?.activePhase) {
    const countersToUse =
      counters ?? emptyPhaseCounters(series.activePhase.calibrationPhaseId);
    const closedPhase: HfCalibrationPhaseRecord = {
      ...series.activePhase,
      phaseEndedAt: effectiveAtIso,
    };
    completedPhases.push(closedPhase);
    if (closedPhase.effectiveConfig) {
      completedSummaries.push(
        finalizePhaseSummary({
          phase: closedPhase,
          counters: countersToUse,
          phaseEndedAtMs: args.effectiveAtMs,
        }),
      );
    }
    counters = null;
  }

  const phaseSequence = completedPhases.length + 1;
  const phaseId = newId();
  const phaseOrder = [...(series?.phaseOrder ?? [])];
  if (phaseOrder[phaseOrder.length - 1] !== intervalMs) {
    phaseOrder.push(intervalMs);
  }

  const draftPhase: HfCalibrationPhaseRecord = {
    calibrationPhaseId: phaseId,
    phaseSequence,
    effectivePollIntervalMs: intervalMs,
    phaseStartedAt: effectiveAtIso,
    phaseEndedAt: null,
  };

  const baseSeries: HfCalibrationSeriesState = series ?? {
    calibrationSeriesId: newId(),
    vehicleId: '',
    tokenId: 0,
    phaseOrder: [],
    activePhase: null,
    completedPhases: [],
    completedPhaseSummaries: [],
    pendingPhaseRequest: null,
    cancelledPhaseRequests: [],
    terminalFinalizationAt: null,
    lastPhaseBoundaryAt: null,
    seriesStartedAt: effectiveAtIso,
    controlPlaneRevision: 0,
  };

  const effectiveConfig = buildEffectiveConfigSnapshot({
    series: baseSeries,
    phase: draftPhase,
    hfPolicy: args.hfPolicy,
    effectiveAtMs: args.effectiveAtMs,
  });

  const activePhase: HfCalibrationPhaseRecord = { ...draftPhase, effectiveConfig };

  const nextSeries: HfCalibrationSeriesState = {
    ...baseSeries,
    phaseOrder,
    activePhase,
    completedPhases,
    completedPhaseSummaries: completedSummaries,
    pendingPhaseRequest: null,
    lastPhaseBoundaryAt: series?.activePhase ? effectiveAtIso : null,
    controlPlaneRevision: (series?.controlPlaneRevision ?? 0) + 1,
  };

  return {
    series: nextSeries,
    applied: true,
    resetLastHfHistoricalPollAt: true,
    activePhaseCounters: emptyPhaseCounters(phaseId),
  };
}

export type ReferenceCaptureCycleDataPlaneState = {
  cycleCount: number;
  lastCycleAt: string | null;
  hfWatermarkAt: string | null;
  hfWatermarkByField: Record<string, string>;
  hfQueryCoverageByField: Record<string, string>;
  hfPhysicalIdentityVersion: 'LEGACY_VALUE_V1' | 'AGGREGATE_BUCKET_V2';
  hfQueryProvenanceRing: Array<Record<string, unknown>>;
  hfRecoveryCursorByField: Record<string, string>;
  lastRecoverySweepAt: string | null;
  recoverySweepCount: number;
  lastHfHistoricalPollAt: string | null;
  eventWatermarkAt: string | null;
  seenEventFingerprints: string[];
  seenPhysicalSampleFingerprints: string[];
  lastSequenceNumber: number;
  quarantinedProviderFields: string[];
  consecutiveTransientFailures: number;
  lastFailureClass: string | null;
  lastFailureAt: string | null;
  hfCalibrationActiveCounters?: HfCalibrationPhaseRuntimeCounters | null;
};

/**
 * Merge data-plane cycle output with persisted control-plane calibration at cycle release.
 * Pending phase requests activate here — never mid-cycle.
 */
export function buildCycleReleaseAcquisitionState(args: {
  persisted: {
    hfCalibrationSeries?: HfCalibrationSeriesState | null;
    hfCalibrationActiveCounters?: HfCalibrationPhaseRuntimeCounters | null;
    acquisitionStateVersion?: number;
    eventWatermarkAt?: string | null;
    seenEventFingerprints?: string[];
    seenPhysicalSampleFingerprints?: string[];
    quarantinedProviderFields?: string[];
    consecutiveTransientFailures?: number;
    lastFailureClass?: string | null;
    lastFailureAt?: string | null;
  };
  dataPlane: ReferenceCaptureCycleDataPlaneState;
  hfPolicy: HfRecoveryPolicyV2Config;
  effectiveAtMs: number;
  idFactory?: () => string;
}): ReferenceCaptureCycleDataPlaneState & {
  hfCalibrationSeries: HfCalibrationSeriesState | null;
  hfCalibrationActiveCounters: HfCalibrationPhaseRuntimeCounters | null;
  acquisitionStateVersion: number;
  activeCycleJobId: null;
} {
  const boundary = applyPendingCalibrationPhaseAtBoundary({
    series: args.persisted.hfCalibrationSeries ?? null,
    pending: args.persisted.hfCalibrationSeries?.pendingPhaseRequest ?? null,
    counters:
      args.dataPlane.hfCalibrationActiveCounters ??
      args.persisted.hfCalibrationActiveCounters ??
      null,
    hfPolicy: args.hfPolicy,
    effectiveAtMs: args.effectiveAtMs,
    idFactory: args.idFactory,
  });

  const lastHfHistoricalPollAt = boundary.resetLastHfHistoricalPollAt
    ? null
    : args.dataPlane.lastHfHistoricalPollAt;

  const { hfCalibrationActiveCounters: _omitCounters, ...dataScalars } = args.dataPlane;

  return {
    ...dataScalars,
    lastHfHistoricalPollAt,
    hfCalibrationSeries: boundary.series,
    hfCalibrationActiveCounters: boundary.activePhaseCounters,
    acquisitionStateVersion: (args.persisted.acquisitionStateVersion ?? 0) + 1,
    activeCycleJobId: null,
  };
}

/** @deprecated Use buildCycleReleaseAcquisitionState */
export function mergeCycleReleaseAcquisitionState(args: {
  persisted: {
    hfCalibrationSeries: HfCalibrationSeriesState | null;
    hfCalibrationActiveCounters: HfCalibrationPhaseRuntimeCounters | null;
    acquisitionStateVersion: number;
  };
  dataPlane: ReferenceCaptureCycleDataPlaneState;
  hfPolicy: HfRecoveryPolicyV2Config;
  effectiveAtMs: number;
}): {
  merged: ReturnType<typeof buildCycleReleaseAcquisitionState>;
} {
  return {
    merged: buildCycleReleaseAcquisitionState({
      persisted: args.persisted,
      dataPlane: args.dataPlane,
      hfPolicy: args.hfPolicy,
      effectiveAtMs: args.effectiveAtMs,
    }),
  };
}

export function accumulatePhaseQueryMetrics(
  counters: HfCalibrationPhaseRuntimeCounters | null,
  input: {
    record: Pick<
      HfQueryProvenanceRecord,
      | 'status'
      | 'resultBucketCount'
      | 'duplicateBucketCount'
      | 'revisionBucketCount'
      | 'recoveredLateBucketCount'
      | 'maxIntraResponseTemporalGapMs'
      | 'windowClassification'
      | 'queryOrigin'
    >;
    newBucketCount: number;
    temporalBucketStartTimestamps: string[];
  },
  phaseId: string,
): HfCalibrationPhaseRuntimeCounters {
  const base = counters?.calibrationPhaseId === phaseId ? counters : emptyPhaseCounters(phaseId);
  const isTransition = input.record.windowClassification === 'TRANSITION_WINDOW';
  const isRecoverySweep = input.record.queryOrigin === 'RECOVERY_SWEEP';
  const isNativeFastLoop = !isTransition && !isRecoverySweep;

  const nativeStarts = new Set(base.nativeUniqueTemporalBucketStarts);
  if (isNativeFastLoop) {
    for (const ts of input.temporalBucketStartTimestamps) {
      if (ts) nativeStarts.add(ts);
    }
  }

  const maxIntra =
    isNativeFastLoop && input.record.maxIntraResponseTemporalGapMs != null
      ? Math.max(
          base.nativeMaxIntraResponseTemporalGapMs ?? 0,
          input.record.maxIntraResponseTemporalGapMs,
        )
      : base.nativeMaxIntraResponseTemporalGapMs;

  return {
    ...base,
    allRequestCount: base.allRequestCount + 1,
    nativeFastLoopRequestCount:
      base.nativeFastLoopRequestCount + (isNativeFastLoop ? 1 : 0),
    nativeFastLoopProviderSuccessCount:
      base.nativeFastLoopProviderSuccessCount +
      (isNativeFastLoop && input.record.status === 'SUCCESS' ? 1 : 0),
    nativeFastLoopProviderZeroResultCount:
      base.nativeFastLoopProviderZeroResultCount +
      (isNativeFastLoop && input.record.status === 'ZERO_RESULT' ? 1 : 0),
    nativeFastLoopProviderErrorCount:
      base.nativeFastLoopProviderErrorCount +
      (isNativeFastLoop && input.record.status === 'PROVIDER_ERROR' ? 1 : 0),
    nativeFastLoopProviderBucketCount:
      base.nativeFastLoopProviderBucketCount +
      (isNativeFastLoop ? input.record.resultBucketCount : 0),
    nativeFastLoopNewBucketCount:
      base.nativeFastLoopNewBucketCount + (isNativeFastLoop ? input.newBucketCount : 0),
    nativeFastLoopDuplicateBucketCount:
      base.nativeFastLoopDuplicateBucketCount +
      (isNativeFastLoop ? (input.record.duplicateBucketCount ?? 0) : 0),
    nativeFastLoopRevisionBucketCount:
      base.nativeFastLoopRevisionBucketCount +
      (isNativeFastLoop ? (input.record.revisionBucketCount ?? 0) : 0),
    transitionRequestCount: base.transitionRequestCount + (isTransition ? 1 : 0),
    transitionProviderBucketCount:
      base.transitionProviderBucketCount + (isTransition ? input.record.resultBucketCount : 0),
    recoverySweepRequestCount: base.recoverySweepRequestCount + (isRecoverySweep ? 1 : 0),
    recoveredLateBucketCount:
      base.recoveredLateBucketCount + (input.record.recoveredLateBucketCount ?? 0),
    transitionWindowCount: base.transitionWindowCount + (isTransition ? 1 : 0),
    nativeUniqueTemporalBucketStarts: [...nativeStarts],
    nativeMaxIntraResponseTemporalGapMs: maxIntra,
  };
}

export type TerminalCalibrationFinalizationReason =
  | 'STOP'
  | 'ABORT'
  | 'FAILURE'
  | 'MAX_DURATION';

export function finalizeTerminalCalibrationSeries(args: {
  series: HfCalibrationSeriesState | null;
  counters: HfCalibrationPhaseRuntimeCounters | null;
  terminalAtMs: number;
  reason: TerminalCalibrationFinalizationReason;
}): {
  series: HfCalibrationSeriesState | null;
  applied: boolean;
  terminalSummary: HfCalibrationPhaseSummary | null;
} {
  if (!args.series) {
    return { series: null, applied: false, terminalSummary: null };
  }

  if (args.series.terminalFinalizationAt) {
    return { series: args.series, applied: false, terminalSummary: null };
  }

  const terminalAtIso = new Date(args.terminalAtMs).toISOString();
  let cancelledPhaseRequests = [...(args.series.cancelledPhaseRequests ?? [])];
  let pendingPhaseRequest = args.series.pendingPhaseRequest;

  if (pendingPhaseRequest) {
    cancelledPhaseRequests.push({
      ...pendingPhaseRequest,
      cancelledAt: terminalAtIso,
      cancelReason: args.reason,
      neverEffective: true,
    });
    pendingPhaseRequest = null;
  }

  if (!args.series.activePhase) {
    if (cancelledPhaseRequests.length === (args.series.cancelledPhaseRequests ?? []).length) {
      return { series: args.series, applied: false, terminalSummary: null };
    }
    return {
      series: {
        ...args.series,
        pendingPhaseRequest: null,
        cancelledPhaseRequests,
        terminalFinalizationAt: terminalAtIso,
        controlPlaneRevision: args.series.controlPlaneRevision + 1,
      },
      applied: true,
      terminalSummary: null,
    };
  }

  const alreadySummarized = args.series.completedPhaseSummaries.some(
    (s) => s.calibrationPhaseId === args.series!.activePhase!.calibrationPhaseId,
  );
  if (alreadySummarized) {
    return {
      series: {
        ...args.series,
        activePhase: null,
        pendingPhaseRequest: null,
        cancelledPhaseRequests,
        terminalFinalizationAt: terminalAtIso,
        controlPlaneRevision: args.series.controlPlaneRevision + 1,
      },
      applied: false,
      terminalSummary: null,
    };
  }

  const countersToUse =
    args.counters?.calibrationPhaseId === args.series.activePhase.calibrationPhaseId
      ? args.counters
      : emptyPhaseCounters(args.series.activePhase.calibrationPhaseId);

  const closedPhase: HfCalibrationPhaseRecord = {
    ...args.series.activePhase,
    phaseEndedAt: terminalAtIso,
  };
  const completedPhases = [...args.series.completedPhases, closedPhase];
  const terminalSummary = closedPhase.effectiveConfig
    ? finalizePhaseSummary({
        phase: closedPhase,
        counters: countersToUse,
        phaseEndedAtMs: args.terminalAtMs,
      })
    : null;
  const completedPhaseSummaries = terminalSummary
    ? [...args.series.completedPhaseSummaries, terminalSummary]
    : args.series.completedPhaseSummaries;

  return {
    series: {
      ...args.series,
      activePhase: null,
      completedPhases,
      completedPhaseSummaries,
      pendingPhaseRequest: null,
      cancelledPhaseRequests,
      terminalFinalizationAt: terminalAtIso,
      lastPhaseBoundaryAt: terminalAtIso,
      controlPlaneRevision: args.series.controlPlaneRevision + 1,
    },
    applied: true,
    terminalSummary,
  };
}

/** Session-scoped override uses EFFECTIVE active phase only (not pending). */
export function resolveEffectiveHfPollIntervalMs(
  config: HfRecoveryPolicyV2Config,
  calibration: HfCalibrationSeriesState | null | undefined,
): number {
  const activeMs = calibration?.activePhase?.effectivePollIntervalMs;
  if (config.mode === 'V2' && activeMs != null && Number.isFinite(activeMs)) {
    return clampHfPollIntervalMs(activeMs);
  }
  return config.hfHistoricalPollIntervalMs;
}

export function applyHfPolicyWithSessionPollOverride(
  config: HfRecoveryPolicyV2Config,
  calibration: HfCalibrationSeriesState | null | undefined,
): HfRecoveryPolicyV2Config {
  const effectiveMs = resolveEffectiveHfPollIntervalMs(config, calibration);
  if (config.mode !== 'V2' || !calibration?.activePhase) return config;
  if (effectiveMs === config.hfHistoricalPollIntervalMs) return config;
  return { ...config, hfHistoricalPollIntervalMs: effectiveMs };
}

export function classifyCalibrationQueryWindow(args: {
  queryFrom: Date;
  queryTo: Date;
  requestStartedAt: Date;
  calibration: HfCalibrationSeriesState | null | undefined;
}): HfCalibrationWindowClassification {
  const boundaryAt = args.calibration?.lastPhaseBoundaryAt;
  if (!boundaryAt) return 'PHASE_NATIVE';
  const boundaryMs = Date.parse(boundaryAt);
  if (!Number.isFinite(boundaryMs)) return 'PHASE_NATIVE';

  const queryFromMs = args.queryFrom.getTime();
  const queryToMs = args.queryTo.getTime();
  const requestMs = args.requestStartedAt.getTime();

  if (queryFromMs < boundaryMs && queryToMs > boundaryMs) {
    return 'TRANSITION_WINDOW';
  }
  if (requestMs >= boundaryMs && queryFromMs < boundaryMs) {
    return 'TRANSITION_WINDOW';
  }
  return 'PHASE_NATIVE';
}

export function buildCalibrationPhaseContext(args: {
  calibration: HfCalibrationSeriesState;
  queryFrom: Date;
  queryTo: Date;
  requestStartedAt: Date;
}): HfCalibrationPhaseContext | null {
  const active = args.calibration.activePhase;
  if (!active) return null;
  return {
    calibrationSeriesId: args.calibration.calibrationSeriesId,
    calibrationPhaseId: active.calibrationPhaseId,
    phaseSequence: active.phaseSequence,
    effectivePollIntervalMs: active.effectivePollIntervalMs,
    phaseStartedAt: active.phaseStartedAt,
    phaseBoundaryAt: args.calibration.lastPhaseBoundaryAt,
    windowClassification: classifyCalibrationQueryWindow({
      queryFrom: args.queryFrom,
      queryTo: args.queryTo,
      requestStartedAt: args.requestStartedAt,
      calibration: args.calibration,
    }),
  };
}

/** @deprecated C.1c immediate switch — superseded by pending-at-boundary in C.1d */
export type SwitchHfCalibrationPhaseResult = {
  series: HfCalibrationSeriesState;
  resetLastHfHistoricalPollAt: boolean;
  previousPhaseEndedAt: string | null;
};

export function switchHfCalibrationPhase(args: {
  existing: HfCalibrationSeriesState | null;
  vehicleId: string;
  tokenId: number;
  effectivePollIntervalMs: number;
  nowMs: number;
  idFactory?: () => string;
}): SwitchHfCalibrationPhaseResult {
  const intervalMs = clampHfPollIntervalMs(args.effectivePollIntervalMs);
  const { series, request } = requestHfCalibrationPhase({
    existing: args.existing,
    vehicleId: args.vehicleId,
    tokenId: args.tokenId,
    effectivePollIntervalMs: intervalMs,
    nowMs: args.nowMs,
    idFactory: args.idFactory,
  });
  const applied = applyPendingCalibrationPhaseAtBoundary({
    series,
    pending: request,
    counters: null,
    hfPolicy: {
      mode: 'V2',
      settlementDelayMs: 8000,
      recoveryOverlapMs: 6000,
      hfHistoricalPollIntervalMs: intervalMs,
      recoverySweepEnabled: false,
      recoverySweepIntervalMs: 300_000,
      recoverySweepLookbackMs: 1_800_000,
      availabilityCalibrationEnabled: false,
      canaryOnly: false,
      canaryTokenIds: [],
    },
    effectiveAtMs: args.nowMs,
    idFactory: args.idFactory,
  });
  return {
    series: applied.series!,
    resetLastHfHistoricalPollAt: applied.resetLastHfHistoricalPollAt,
    previousPhaseEndedAt: applied.series?.lastPhaseBoundaryAt ?? null,
  };
}

export function verifyPhaseTransitionCoverageContinuity(args: {
  previousQueryCoverageTo: string | Date;
  nextQueryFrom: Date;
  recoveryOverlapMs: number;
}): boolean {
  return verifyNoUnqueriedGap(args);
}

export function isRecognizedCalibrationPollIntervalMs(value: number): boolean {
  return (HF_POLL_CALIBRATION_CANDIDATES_MS as readonly number[]).includes(value);
}

export const HF_CALIBRATION_EXPLORATORY_PHASE_DURATION_GUIDANCE = {
  label: 'PROVISIONAL_EXPLORATORY_ONLY',
  note:
    'Collect enough provider requests and buckets per phase for comparison; no scientifically validated minimum duration. Evidence may span multiple physical drives.',
};
