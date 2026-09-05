/**
 * DI-EV-0035C.1c — Single-drive multi-cadence Flight Recorder calibration (Reference Capture only).
 *
 * PHYSICAL_TRIP != CALIBRATION_PHASE. Session-scoped poll override does not affect production HF.
 */
import { randomUUID } from 'node:crypto';
import {
  clampHfPollIntervalMs,
  HF_POLL_CALIBRATION_CANDIDATES_MS,
  verifyNoUnqueriedGap,
} from './reference-capture-hf-block-polling.policy';
import type { HfRecoveryPolicyV2Config } from './reference-capture-hf-recovery-v2.policy';

export type HfCalibrationWindowClassification = 'PHASE_NATIVE' | 'TRANSITION_WINDOW';

export type HfCalibrationPhaseRecord = {
  calibrationPhaseId: string;
  phaseSequence: number;
  effectivePollIntervalMs: number;
  phaseStartedAt: string;
  phaseEndedAt: string | null;
};

export type HfCalibrationSeriesState = {
  calibrationSeriesId: string;
  vehicleId: string;
  tokenId: number;
  /** Poll intervals in the order phases were activated (e.g. [10000, 20000, 30000, 60000]). */
  phaseOrder: number[];
  activePhase: HfCalibrationPhaseRecord | null;
  completedPhases: HfCalibrationPhaseRecord[];
  /** Timestamp of the most recent phase boundary (for transition-window classification). */
  lastPhaseBoundaryAt: string | null;
  seriesStartedAt: string;
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
    lastPhaseBoundaryAt: raw.lastPhaseBoundaryAt ?? null,
    seriesStartedAt: raw.seriesStartedAt,
  };
}

/** Session-scoped override takes precedence over process-level HF_HISTORICAL_POLL_INTERVAL_MS. */
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

export type SwitchHfCalibrationPhaseResult = {
  series: HfCalibrationSeriesState;
  /** Reset poll gate so new cadence applies without waiting prior interval. */
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
  const nowIso = new Date(args.nowMs).toISOString();
  const intervalMs = clampHfPollIntervalMs(args.effectivePollIntervalMs);
  const newId = args.idFactory ?? randomUUID;

  if (!args.existing) {
    const phaseId = newId();
    const series: HfCalibrationSeriesState = {
      calibrationSeriesId: newId(),
      vehicleId: args.vehicleId,
      tokenId: args.tokenId,
      phaseOrder: [intervalMs],
      activePhase: {
        calibrationPhaseId: phaseId,
        phaseSequence: 1,
        effectivePollIntervalMs: intervalMs,
        phaseStartedAt: nowIso,
        phaseEndedAt: null,
      },
      completedPhases: [],
      lastPhaseBoundaryAt: null,
      seriesStartedAt: nowIso,
    };
    return {
      series,
      resetLastHfHistoricalPollAt: true,
      previousPhaseEndedAt: null,
    };
  }

  const completed = [...args.existing.completedPhases];
  let previousPhaseEndedAt: string | null = null;
  if (args.existing.activePhase) {
    previousPhaseEndedAt = nowIso;
    completed.push({
      ...args.existing.activePhase,
      phaseEndedAt: nowIso,
    });
  }

  const phaseSequence = completed.length + 1;
  const phaseId = newId();
  const series: HfCalibrationSeriesState = {
    ...args.existing,
    phaseOrder: [...args.existing.phaseOrder, intervalMs],
    completedPhases: completed,
    activePhase: {
      calibrationPhaseId: phaseId,
      phaseSequence,
      effectivePollIntervalMs: intervalMs,
      phaseStartedAt: nowIso,
      phaseEndedAt: null,
    },
    lastPhaseBoundaryAt: nowIso,
  };

  return {
    series,
    resetLastHfHistoricalPollAt: true,
    previousPhaseEndedAt,
  };
}

/** Phase transition must not create coverage gaps when overlap semantics hold. */
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
