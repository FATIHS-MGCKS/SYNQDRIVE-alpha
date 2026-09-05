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
  providerRequestCount: number;
  providerSuccessCount: number;
  providerZeroResultCount: number;
  providerErrorCount: number;
  providerBucketCount: number;
  newBucketCount: number;
  duplicateBucketCount: number;
  revisionBucketCount: number;
  recoveredLateBucketCount: number;
  transitionWindowCount: number;
  uniqueTemporalBucketStartCount: number;
  maxIntraResponseTemporalGapMs: number | null;
};

export type HfCalibrationPhaseRuntimeCounters = {
  calibrationPhaseId: string;
  providerRequestCount: number;
  providerSuccessCount: number;
  providerZeroResultCount: number;
  providerErrorCount: number;
  providerBucketCount: number;
  newBucketCount: number;
  duplicateBucketCount: number;
  revisionBucketCount: number;
  recoveredLateBucketCount: number;
  transitionWindowCount: number;
  uniqueTemporalBucketStarts: string[];
  maxIntraResponseTemporalGapMs: number | null;
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

  const base: HfCalibrationSeriesState = args.existing ?? {
    calibrationSeriesId: newId(),
    vehicleId: args.vehicleId,
    tokenId: args.tokenId,
    phaseOrder: [],
    activePhase: null,
    completedPhases: [],
    completedPhaseSummaries: [],
    pendingPhaseRequest: null,
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
    providerRequestCount: 0,
    providerSuccessCount: 0,
    providerZeroResultCount: 0,
    providerErrorCount: 0,
    providerBucketCount: 0,
    newBucketCount: 0,
    duplicateBucketCount: 0,
    revisionBucketCount: 0,
    recoveredLateBucketCount: 0,
    transitionWindowCount: 0,
    uniqueTemporalBucketStarts: [],
    maxIntraResponseTemporalGapMs: null,
  };
}

export function finalizePhaseSummary(args: {
  phase: HfCalibrationPhaseRecord;
  counters: HfCalibrationPhaseRuntimeCounters;
  phaseEndedAtMs: number;
}): HfCalibrationPhaseSummary {
  const startedMs = Date.parse(args.phase.phaseStartedAt);
  const endedMs = args.phaseEndedAtMs;
  const uniqueStarts = new Set(args.counters.uniqueTemporalBucketStarts);
  return {
    calibrationPhaseId: args.phase.calibrationPhaseId,
    phaseSequence: args.phase.phaseSequence,
    effectivePollIntervalMs: args.phase.effectivePollIntervalMs,
    phaseStartedAt: args.phase.phaseStartedAt,
    phaseEndedAt: new Date(endedMs).toISOString(),
    durationMs: Number.isFinite(startedMs) ? Math.max(0, endedMs - startedMs) : 0,
    effectiveConfig: args.phase.effectiveConfig!,
    providerRequestCount: args.counters.providerRequestCount,
    providerSuccessCount: args.counters.providerSuccessCount,
    providerZeroResultCount: args.counters.providerZeroResultCount,
    providerErrorCount: args.counters.providerErrorCount,
    providerBucketCount: args.counters.providerBucketCount,
    newBucketCount: args.counters.newBucketCount,
    duplicateBucketCount: args.counters.duplicateBucketCount,
    revisionBucketCount: args.counters.revisionBucketCount,
    recoveredLateBucketCount: args.counters.recoveredLateBucketCount,
    transitionWindowCount: args.counters.transitionWindowCount,
    uniqueTemporalBucketStartCount: uniqueStarts.size,
    maxIntraResponseTemporalGapMs: args.counters.maxIntraResponseTemporalGapMs,
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
  record: Pick<
    HfQueryProvenanceRecord,
    | 'status'
    | 'resultBucketCount'
    | 'duplicateBucketCount'
    | 'revisionBucketCount'
    | 'recoveredLateBucketCount'
    | 'uniqueTemporalBucketStartCount'
    | 'maxIntraResponseTemporalGapMs'
    | 'windowClassification'
  >,
  newBucketCount: number,
  phaseId: string,
): HfCalibrationPhaseRuntimeCounters {
  const base = counters?.calibrationPhaseId === phaseId ? counters : emptyPhaseCounters(phaseId);
  const uniqueStarts = new Set(base.uniqueTemporalBucketStarts);
  if (record.uniqueTemporalBucketStartCount != null && record.uniqueTemporalBucketStartCount > 0) {
    uniqueStarts.add(`${record.uniqueTemporalBucketStartCount}:${base.providerRequestCount}`);
  }
  const maxGap =
    record.maxIntraResponseTemporalGapMs != null
      ? Math.max(base.maxIntraResponseTemporalGapMs ?? 0, record.maxIntraResponseTemporalGapMs)
      : base.maxIntraResponseTemporalGapMs;

  return {
    ...base,
    providerRequestCount: base.providerRequestCount + 1,
    providerSuccessCount: base.providerSuccessCount + (record.status === 'SUCCESS' ? 1 : 0),
    providerZeroResultCount: base.providerZeroResultCount + (record.status === 'ZERO_RESULT' ? 1 : 0),
    providerErrorCount: base.providerErrorCount + (record.status === 'PROVIDER_ERROR' ? 1 : 0),
    providerBucketCount: base.providerBucketCount + record.resultBucketCount,
    newBucketCount: base.newBucketCount + newBucketCount,
    duplicateBucketCount: base.duplicateBucketCount + (record.duplicateBucketCount ?? 0),
    revisionBucketCount: base.revisionBucketCount + (record.revisionBucketCount ?? 0),
    recoveredLateBucketCount: base.recoveredLateBucketCount + (record.recoveredLateBucketCount ?? 0),
    transitionWindowCount:
      base.transitionWindowCount + (record.windowClassification === 'TRANSITION_WINDOW' ? 1 : 0),
    uniqueTemporalBucketStarts: [...uniqueStarts],
    maxIntraResponseTemporalGapMs: maxGap,
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
