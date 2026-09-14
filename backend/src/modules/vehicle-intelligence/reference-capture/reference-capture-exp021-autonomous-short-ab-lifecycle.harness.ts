/**
 * Deterministic in-memory harness simulating the autonomous orchestrator's
 * candidate_short_ab_90_60 lifecycle without wall-clock waits or manual paths.
 *
 * Mirrors the call sequence in reference-capture-exp-021-autonomous-orchestrator.ts:
 * session ownership → recording → T0 persist → activatePhysicalPhaseAtT0 →
 * phaseTracker wall transitions → switchHfCalibrationPhase (pending) →
 * cycle-boundary apply → terminal STOP.
 */
import { randomUUID } from 'crypto';
import {
  applyPendingCalibrationPhaseAtBoundary,
  buildInitialPhaseCounters,
  finalizeTerminalCalibrationSeries,
  reanchorPhysicalCalibrationPhaseAtT0,
  requestHfCalibrationPhase,
  type HfCalibrationPhaseRuntimeCounters,
  type HfCalibrationSeriesState,
} from './reference-capture-hf-calibration-phase.policy';
import {
  buildPhaseAdvancementConfig,
  cadenceSequenceFromPlan,
  EXP021_CANDIDATE_SHORT_AB_90_60,
  resolveExp021CalibrationPlanFromSources,
} from './reference-capture-exp021-calibration-plan.lib';
import { resolveExp021CalibrationPlanForSeries } from './reference-capture-hf-calibration-phase.policy';
import { computeExp021SettlementQueryBudget } from './reference-capture-settlement-shadow.policy';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';
import {
  buildExp021PhysicalAuthority,
  mergeExp021PhysicalAuthority,
  type Exp021PhysicalAuthority,
} from './reference-capture-exp-021-physical-authority.lib';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';
import {
  EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY,
  isOrchestratorOwnedRecordingSession,
  buildExp021RuntimeConfig,
  type Exp021RuntimeConfig,
} from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';

export type HarnessSessionStatus = 'READY' | 'RECORDING' | 'COMPLETED' | 'ABORTED';

export interface HarnessSnapshot {
  sessionId: string;
  orchestratorRunId: string;
  status: HarnessSessionStatus;
  preflightJson: Record<string, unknown>;
  series: HfCalibrationSeriesState | null;
  counters: HfCalibrationPhaseRuntimeCounters | null;
  t0Ms: number | null;
  currentPhaseIndex: number;
  nowMs: number;
  physicalDriveEnded: boolean;
  manualPhaseTransitionCalls: number;
}

export interface HarnessRunResult {
  t0Ms: number;
  completedAtMs: number;
  series: HfCalibrationSeriesState;
  counters: HfCalibrationPhaseRuntimeCounters | null;
  status: HarnessSessionStatus;
  currentPhaseIndex: number;
  manualPhaseTransitionCalls: number;
  slotCountsByPhase: Array<{ cadenceMs: number; slotCount: number }>;
}

const VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const TOKEN_ID = 192_922;
const TEN_MIN_MS = 10 * 60_000;
const NOMINAL_TOTAL_MS = 20 * 60_000;

export class Exp021ShortAbAutonomousLifecycleHarness {
  readonly plan = EXP021_CANDIDATE_SHORT_AB_90_60;
  readonly cadencePhaseOrderMs = cadenceSequenceFromPlan(this.plan);
  readonly hfPolicy = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '120000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  private nowMs: number;
  private sessionId: string;
  private orchestratorRunId: string;
  private status: HarnessSessionStatus = 'READY';
  private preflightJson: Record<string, unknown> = {};
  private series: HfCalibrationSeriesState | null = null;
  private counters: HfCalibrationPhaseRuntimeCounters | null = null;
  private t0Ms: number | null = null;
  private currentPhaseIndex = -1;
  private physicalDriveEnded = false;
  private manualPhaseTransitionCalls = 0;
  private phaseTracker = new PhysicalDrivePhaseTracker();
  private idCounter = 0;
  private readonly idFactory = () => `harness-id-${++this.idCounter}`;

  constructor(options?: { startMs?: number; orchestratorRunId?: string; sessionId?: string }) {
    this.nowMs = options?.startMs ?? Date.parse('2026-09-14T11:43:53.000Z');
    this.orchestratorRunId = options?.orchestratorRunId ?? `exp021-harness-${randomUUID()}`;
    this.sessionId = options?.sessionId ?? randomUUID();
  }

  get now(): number {
    return this.nowMs;
  }

  get snapshot(): HarnessSnapshot {
    return {
      sessionId: this.sessionId,
      orchestratorRunId: this.orchestratorRunId,
      status: this.status,
      preflightJson: { ...this.preflightJson },
      series: this.series ? structuredClone(this.series) : null,
      counters: this.counters ? structuredClone(this.counters) : null,
      t0Ms: this.t0Ms,
      currentPhaseIndex: this.currentPhaseIndex,
      nowMs: this.nowMs,
      physicalDriveEnded: this.physicalDriveEnded,
      manualPhaseTransitionCalls: this.manualPhaseTransitionCalls,
    };
  }

  restore(snapshot: HarnessSnapshot): void {
    this.sessionId = snapshot.sessionId;
    this.orchestratorRunId = snapshot.orchestratorRunId;
    this.status = snapshot.status;
    this.preflightJson = { ...snapshot.preflightJson };
    this.series = snapshot.series ? structuredClone(snapshot.series) : null;
    this.counters = snapshot.counters ? structuredClone(snapshot.counters) : null;
    this.t0Ms = snapshot.t0Ms;
    this.currentPhaseIndex = snapshot.currentPhaseIndex;
    this.nowMs = snapshot.nowMs;
    this.physicalDriveEnded = snapshot.physicalDriveEnded;
    this.manualPhaseTransitionCalls = snapshot.manualPhaseTransitionCalls;
    this.phaseTracker = new PhysicalDrivePhaseTracker();
    if (this.t0Ms != null && this.currentPhaseIndex >= 0 && this.series?.activePhase) {
      const cadence = this.cadencePhaseOrderMs[this.currentPhaseIndex];
      const phaseSpec = this.plan.phases[this.currentPhaseIndex];
      this.phaseTracker.beginPhase(
        cadence,
        Date.parse(this.series.activePhase.phaseStartedAt),
        buildPhaseAdvancementConfig(this.plan, phaseSpec),
      );
    }
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  setNow(ms: number): void {
    this.nowMs = ms;
  }

  /** Orchestrator PREP: create session + durable ownership stamp. */
  autonomousCreateSession(): void {
    this.preflightJson = {
      [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: {
        runId: this.orchestratorRunId,
        startedAt: new Date(this.nowMs).toISOString(),
      },
    };
    this.status = 'READY';
  }

  /** Orchestrator WAIT_TELEMETRY → startRecording. */
  autonomousStartRecording(): void {
    if (!isOrchestratorOwnedRecordingSession(this.preflightJson, this.orchestratorRunId)) {
      throw new Error('refusing recording start without orchestrator ownership stamp');
    }
    this.status = 'RECORDING';
  }

  /** Orchestrator WAIT_MOVEMENT → persistExp021CanonicalT0. */
  autonomousPersistT0(t0Ms?: number): Exp021PhysicalAuthority {
    const canonicalMs = t0Ms ?? this.nowMs;
    const authority = buildExp021PhysicalAuthority({
      firstQualifyingMovementAt: new Date(canonicalMs),
      startConfirmedAt: new Date(canonicalMs + 1_000),
      persistedAtMs: this.nowMs,
    });
    this.preflightJson = mergeExp021PhysicalAuthority(this.preflightJson, authority) as Record<
      string,
      unknown
    >;
    this.t0Ms = canonicalMs;
    return authority;
  }

  /** Orchestrator activatePhysicalPhaseFromPersistedAuthority (first cadence = 90s). */
  autonomousActivateFirstPhase(): void {
    if (this.t0Ms == null) throw new Error('T0 required before phase activation');
    const firstCadenceMs = this.cadencePhaseOrderMs[0];
    const reanchored = reanchorPhysicalCalibrationPhaseAtT0({
      existing: this.series,
      vehicleId: VEHICLE_ID,
      tokenId: TOKEN_ID,
      canonicalT0Ms: this.t0Ms,
      effectivePollIntervalMs: firstCadenceMs,
      hfPolicy: this.hfPolicy,
      nowMs: this.nowMs,
      calibrationPlan: this.plan,
    });
    this.series = reanchored.series;
    this.counters = buildInitialPhaseCounters({
      calibrationPhaseId: reanchored.activePhase.calibrationPhaseId,
      phaseEffectiveStartMs: this.t0Ms,
      cadenceMs: firstCadenceMs,
      phaseProvenance: 'PHYSICAL_T0',
      calibrationPlan: this.plan,
    });
    this.currentPhaseIndex = 0;
    this.phaseTracker.beginPhase(
      firstCadenceMs,
      this.t0Ms,
      buildPhaseAdvancementConfig(this.plan, this.plan.phases[0]),
    );
  }

  /**
   * Orchestrator DRIVING tick: wall-clock phase transition without operator commands.
   * Returns whether a transition occurred or lifecycle completed.
   */
  autonomousDrivingTick(): { transitioned: boolean; completed: boolean } {
    if (this.t0Ms == null || !this.series?.activePhase) {
      throw new Error('lifecycle not armed');
    }
    if (this.physicalDriveEnded) {
      return { transitioned: false, completed: true };
    }

    this.phaseTracker.tick('MOVING', this.nowMs);

    const lastPhaseIndex = this.cadencePhaseOrderMs.length - 1;
    const finalPhaseWallClockExpired =
      this.currentPhaseIndex === lastPhaseIndex && this.phaseTracker.shouldAdvancePhase(this.nowMs);

    if (
      this.currentPhaseIndex >= 0 &&
      this.currentPhaseIndex < lastPhaseIndex &&
      this.phaseTracker.shouldAdvancePhase(this.nowMs)
    ) {
      this.orchestratorSwitchPhaseAtBoundary();
      return { transitioned: true, completed: false };
    }

    if (finalPhaseWallClockExpired) {
      this.autonomousCompleteLifecycle('FINAL_PHASE_WALL_CLOCK');
      return { transitioned: false, completed: true };
    }

    return { transitioned: false, completed: false };
  }

  /** Run full 90→60 lifecycle with controlled time (no real 20-minute wait). */
  runAutonomousLifecycle(): HarnessRunResult {
    const slotCountsByPhase: Array<{ cadenceMs: number; slotCount: number }> = [];
    this.autonomousCreateSession();
    this.autonomousStartRecording();
    const authority = this.autonomousPersistT0();
    this.autonomousActivateFirstPhase();
    slotCountsByPhase.push({
      cadenceMs: this.cadencePhaseOrderMs[0],
      slotCount: this.counters?.exp021RequestSlots?.length ?? 0,
    });

    const targetEndMs = authority.canonicalT0At
      ? Date.parse(authority.canonicalT0At) + NOMINAL_TOTAL_MS
      : this.t0Ms! + NOMINAL_TOTAL_MS;

    while (!this.physicalDriveEnded && this.nowMs <= targetEndMs + 60_000) {
      const tick = this.autonomousDrivingTick();
      if (tick.transitioned) {
        slotCountsByPhase.push({
          cadenceMs: this.cadencePhaseOrderMs[this.currentPhaseIndex],
          slotCount: this.counters?.exp021RequestSlots?.length ?? 0,
        });
      }
      this.advance(15_000);
    }

    if (!this.physicalDriveEnded) {
      this.setNow(targetEndMs);
      this.autonomousDrivingTick();
    }

    if (!this.series) throw new Error('series missing after lifecycle');
    return {
      t0Ms: this.t0Ms!,
      completedAtMs: this.nowMs,
      series: this.series,
      counters: this.counters,
      status: this.status,
      currentPhaseIndex: this.currentPhaseIndex,
      manualPhaseTransitionCalls: this.manualPhaseTransitionCalls,
      slotCountsByPhase,
    };
  }

  injectProviderFailures(count: number): void {
    if (!this.counters) return;
    this.counters.nativeFastLoopProviderZeroResultCount = count;
    this.counters.nativeFastLoopProviderErrorCount = count;
  }

  simulateOrchestratorRestart(): void {
    const snap = this.snapshot;
    if (!isOrchestratorOwnedRecordingSession(snap.preflightJson, snap.orchestratorRunId)) {
      throw new Error('restart refused: ownership stamp mismatch');
    }
    this.restore(snap);
  }

  assertScientificGeometry(): void {
    if (!this.series) throw new Error('no series');
    expectPhaseOrder(this.series);
    expectSlotGeometry(this.counters, this.series);
    expectSettlementGeometry();
    expectPlanAuthority(this.series);
    expectNo120Phase(this.series);
  }

  private orchestratorSwitchPhaseAtBoundary(): void {
    const nextIndex = this.currentPhaseIndex + 1;
    const nextCadence = this.cadencePhaseOrderMs[nextIndex];
    const boundaryMs = this.t0Ms! + nextIndex * TEN_MIN_MS;

    const requested = requestHfCalibrationPhase({
      existing: this.series,
      vehicleId: VEHICLE_ID,
      tokenId: TOKEN_ID,
      effectivePollIntervalMs: nextCadence,
      nowMs: boundaryMs - 1,
      idFactory: this.idFactory,
      phaseProvenance: 'PHYSICAL_TRANSITION',
    });
    this.series = requested.series;

    const applied = applyPendingCalibrationPhaseAtBoundary({
      series: this.series,
      pending: this.series.pendingPhaseRequest,
      counters: this.counters,
      hfPolicy: this.hfPolicy,
      effectiveAtMs: boundaryMs,
      idFactory: this.idFactory,
    });
    if (!applied.applied || !applied.series) {
      throw new Error('phase boundary apply failed');
    }
    this.series = applied.series;
    this.counters = applied.activePhaseCounters ?? null;
    this.phaseTracker.advancePhaseAtEffectiveBoundary(
      boundaryMs,
      nextCadence,
      buildPhaseAdvancementConfig(this.plan, this.plan.phases[nextIndex]),
    );
    this.currentPhaseIndex = nextIndex;
    this.manualPhaseTransitionCalls += 0;
  }

  private autonomousCompleteLifecycle(reason: 'FINAL_PHASE_WALL_CLOCK'): void {
    if (!this.series) throw new Error('no series to finalize');
    const terminal = finalizeTerminalCalibrationSeries({
      series: this.series,
      counters: this.counters,
      terminalAtMs: this.nowMs,
      reason: 'STOP',
    });
    this.series = terminal.series ?? this.series;
    this.physicalDriveEnded = true;
    this.status = 'COMPLETED';
    this.preflightJson = mergeExp021PhysicalAuthority(this.preflightJson, {
      orchestrationState: 'COMPLETE',
    }) as Record<string, unknown>;
  }
}

export function buildShortAbRuntimeConfig(): Exp021RuntimeConfig {
  return buildExp021RuntimeConfig({
    env: {
      EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60',
      EXP021_TARGET_DEPLOY_SHA: 'harness-test-sha',
    },
  });
}

export function expectPhaseOrder(series: HfCalibrationSeriesState): void {
  if (series.phaseOrder.join(',') !== '90000,60000') {
    throw new Error(`unexpected phaseOrder: ${series.phaseOrder.join(',')}`);
  }
}

export function expectSlotGeometry(
  counters: HfCalibrationPhaseRuntimeCounters | null,
  series: HfCalibrationSeriesState,
): void {
  const activeSlots = counters?.exp021RequestSlots?.length ?? 0;
  const activeCadence = series.activePhase?.effectivePollIntervalMs;
  if (activeCadence === 90_000 && activeSlots !== 7) {
    throw new Error(`90s phase expected 7 slots, got ${activeSlots}`);
  }
  if (activeCadence === 60_000 && activeSlots !== 10) {
    throw new Error(`60s phase expected 10 slots, got ${activeSlots}`);
  }
  const completed90 = series.completedPhaseSummaries?.find((s) => s.effectivePollIntervalMs === 90_000);
  if (completed90 && countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60) !== 7) {
    throw new Error('90s slot count authority mismatch');
  }
}

export function expectSettlementGeometry(): void {
  const budget = computeExp021SettlementQueryBudget(EXP021_CANDIDATE_SHORT_AB_90_60);
  if (budget.fullPhaseTileCount !== 38 || budget.expectedSettlementQueryCount !== 228) {
    throw new Error('settlement geometry mismatch for short AB plan');
  }
}

export function expectPlanAuthority(series: HfCalibrationSeriesState): void {
  if (series.calibrationPlanId !== 'candidate_short_ab_90_60') {
    throw new Error(`calibrationPlanId mismatch: ${series.calibrationPlanId}`);
  }
  if (series.calibrationPlanVersion !== 'EXP021_CANDIDATE_SHORT_AB_90_60') {
    throw new Error(`calibrationPlanVersion mismatch: ${series.calibrationPlanVersion}`);
  }
  const recovered = resolveExp021CalibrationPlanForSeries(series, {
    EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3',
  });
  if (recovered.planId !== 'candidate_short_ab_90_60') {
    throw new Error('series authority recovery failed');
  }
  const fromMeta = resolveExp021CalibrationPlanFromSources({
    seriesPlanId: null,
    seriesPlanVersion: null,
    metadataPlanId: 'candidate_short_ab_90_60',
    metadataPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
    env: { EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3' },
  });
  if (fromMeta.planId !== 'candidate_short_ab_90_60') {
    throw new Error('metadata authority precedence failed');
  }
}

export function expectNo120Phase(series: HfCalibrationSeriesState): void {
  if (series.phaseOrder.includes(120_000)) {
    throw new Error('120s phase present');
  }
  if (series.completedPhases?.some((p) => p.effectivePollIntervalMs === 120_000)) {
    throw new Error('120s completed phase present');
  }
}
