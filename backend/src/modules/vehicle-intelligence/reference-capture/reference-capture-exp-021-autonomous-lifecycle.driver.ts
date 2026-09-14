/**
 * Canonical EXP-021 autonomous lifecycle driver — shared by production orchestrator
 * and controlled-time regression/integration tests.
 *
 * Owns T0 authority, phase activation, wall-clock transitions, settlement sync,
 * and terminal completion. Process-level concerns (deploy wait, Redis, DIMO polling)
 * remain in reference-capture-exp-021-autonomous-orchestrator.ts.
 */
import type { PrismaService } from '@shared/database/prisma.service';
import type { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';
import {
  ReferenceCaptureSessionRepository,
  parseAcquisitionState,
} from './reference-capture-session.repository';
import type { ReferenceCaptureSessionService } from './reference-capture-session.service';
import type { Exp021RuntimeConfig } from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import { resolvePhaseAdvancementForIndex } from '../../../../scripts/ops/reference-capture-exp-021-autonomous-orchestrator.lib';
import {
  classifyMotionState,
  EXP021_DEFAULT_PHYSICAL_END,
  EXP021_DEFAULT_PHYSICAL_START,
  PhysicalDrivePhaseTracker,
  PhysicalEndDetector,
  PhysicalStartDetector,
  type SpeedSample,
  type MotionState,
} from './reference-capture-exp-021-motion.lib';
import { resolvePhysicalEndSealMs } from './reference-capture-exp-021-physical-authority.lib';
import type { Exp021PhysicalAuthority } from './reference-capture-exp-021-physical-authority.lib';
import { parseExp021PhysicalAuthority } from './reference-capture-exp-021-physical-authority.lib';

export type Exp021LifecycleLogFn = (
  event: string,
  payload?: Record<string, unknown>,
) => void;

export interface Exp021LifecyclePorts {
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
  waitPhaseEffective: (
    sessionId: string,
    pollMs: number,
  ) => Promise<Date>;
  waitForRecordingCycles?: (sessionId: string) => Promise<void>;
  log?: Exp021LifecycleLogFn;
}

export interface Exp021LifecycleDeps {
  config: Exp021RuntimeConfig;
  sessionService: ReferenceCaptureSessionService;
  sessionRepo: ReferenceCaptureSessionRepository;
  settlementShadow: ReferenceCaptureSettlementShadowService;
  prisma?: PrismaService;
}

export type Exp021DrivingTickResult =
  | { status: 'continue' }
  | { status: 'done'; stopReason: 'FINAL_PHASE_WALL_CLOCK' | 'PHYSICAL_RUN_ENDED_EARLY' };

export type Exp021WaitMovementResult =
  | { status: 'continue' }
  | { status: 'skipped'; reason: string }
  | { status: 't0_confirmed' };

export async function syncExp021Settlement(
  settlementShadow: ReferenceCaptureSettlementShadowService,
  sessionRepo: ReferenceCaptureSessionRepository,
  config: Exp021RuntimeConfig,
  sessionId: string,
): Promise<void> {
  const s = await sessionRepo.findById(config.organizationId, sessionId);
  await settlementShadow.syncCompletedPhasesFromSession({
    sessionId,
    organizationId: config.organizationId,
    vehicleId: config.vehicleId,
    tokenId: config.tokenId,
    acquisitionStateJson: s?.acquisitionStateJson,
  });
}

export async function waitExp021RecordingCycles(
  ports: Pick<Exp021LifecyclePorts, 'sleep'>,
  sessionRepo: ReferenceCaptureSessionRepository,
  config: Exp021RuntimeConfig,
  sessionId: string,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await ports.sleep(2000);
    const s = await sessionRepo.findById(config.organizationId, sessionId);
    const st = parseAcquisitionState(s?.acquisitionStateJson);
    if (s?.status === 'RECORDING' && (st.cycleCount ?? 0) >= 1) return;
    if (s?.status === 'FAILED' || s?.status === 'ABORTED') {
      throw new Error(`session terminal ${s?.status}`);
    }
  }
  throw new Error('recording cycles not observed');
}

export function createDefaultWaitPhaseEffective(
  ports: Pick<Exp021LifecyclePorts, 'sleep'>,
  sessionRepo: ReferenceCaptureSessionRepository,
  config: Exp021RuntimeConfig,
): Exp021LifecyclePorts['waitPhaseEffective'] {
  return async (sessionId: string, pollMs: number): Promise<Date> => {
    for (let i = 0; i < 90; i++) {
      await ports.sleep(2000);
      const s = await sessionRepo.findById(config.organizationId, sessionId);
      const st = parseAcquisitionState(s?.acquisitionStateJson);
      const ap = st.hfCalibrationSeries?.activePhase;
      if (ap?.effectivePollIntervalMs === pollMs && ap?.phaseStartedAt) {
        return new Date(ap.phaseStartedAt);
      }
    }
    throw new Error(`phase ${pollMs}ms not effective`);
  };
}

export async function completeExp021PhysicalRunAndStop(args: {
  sessionService: ReferenceCaptureSessionService;
  settlementShadow: ReferenceCaptureSettlementShadowService;
  config: Exp021RuntimeConfig;
  sessionId: string;
  phaseTracker: PhysicalDrivePhaseTracker;
  physicalEndDetector: PhysicalEndDetector;
  physicalDriveEndCandidateId: string | null;
  physicalDriveStartedAt: Date | null;
  nowMs: number;
  reason: 'AUTO_STOP' | 'FINAL_PHASE_WALL_CLOCK' | 'PHYSICAL_RUN_ENDED_EARLY';
}): Promise<void> {
  const endCandidate = args.physicalEndDetector.getCandidate();
  const activePhaseStartedAtMs = args.phaseTracker.getActivePhaseStartedAtMs();
  const boundaryMs =
    args.reason === 'PHYSICAL_RUN_ENDED_EARLY' && endCandidate?.candidateBoundaryAt
      ? endCandidate.candidateBoundaryAt.getTime()
      : null;
  const sealMs = resolvePhysicalEndSealMs({
    nowMs: args.nowMs,
    physicalEndBoundaryMs: boundaryMs,
    activePhaseStartedAtMs,
  });
  const finalPhase = args.phaseTracker.markPhysicalDriveEnded(sealMs);
  if (
    endCandidate &&
    args.physicalDriveEndCandidateId &&
    endCandidate.candidateStatus !== 'CONFIRMED'
  ) {
    await args.settlementShadow.confirmPhysicalDriveIntervalCandidate({
      sessionId: args.sessionId,
      candidateId: args.physicalDriveEndCandidateId,
      reason: `${args.reason.toLowerCase()}_terminalization`,
    });
  }
  const physicalEndAt =
    endCandidate?.candidateBoundaryAt ??
    (args.reason === 'PHYSICAL_RUN_ENDED_EARLY' ? new Date(sealMs) : null);
  if (args.physicalDriveStartedAt && physicalEndAt) {
    await args.settlementShadow.persistPhysicalDriveIntervalAuthority({
      sessionId: args.sessionId,
      physicalStartAt: args.physicalDriveStartedAt,
      physicalEndAt,
      candidateId: endCandidate?.candidateId,
      source: endCandidate ? 'PDI_CANDIDATE' : 'ORCHESTRATOR_CONFIRMED',
    });
  }
  if (finalPhase) {
    await args.sessionService.persistExp021ActivePhaseMovementMetrics(
      args.config.organizationId,
      args.sessionId,
      {
        validMovementDurationMs: finalPhase.validMovementDurationMs,
        uncertainMovementDurationMs: finalPhase.uncertainMovementDurationMs,
      },
    );
  }
  if (args.reason === 'PHYSICAL_RUN_ENDED_EARLY' && physicalEndAt) {
    await args.sessionService.terminalizeExp021PhysicalEndEarly(
      args.config.organizationId,
      args.sessionId,
      physicalEndAt,
    );
  } else {
    await args.sessionService.stopRecording(args.config.organizationId, args.sessionId);
  }
}

export class Exp021AutonomousLifecycleDriver {
  readonly deps: Exp021LifecycleDeps;
  readonly ports: Exp021LifecyclePorts;
  readonly phaseTracker = new PhysicalDrivePhaseTracker();
  readonly physicalStartDetector: PhysicalStartDetector;
  readonly physicalEndDetector: PhysicalEndDetector;

  sessionId: string | null = null;
  currentPhaseIndex = -1;
  phaseActivatedAtMs: number | null = null;
  physicalDriveStarted = false;
  physicalDriveEnded = false;
  physicalDriveStartedAt: Date | null = null;
  physicalDriveEndCandidateId: string | null = null;
  orchestrationDegraded = false;
  pendingT0PhaseActivation = false;
  deployConvergedAtMs: number | null = null;
  manualPhaseTransitionCalls = 0;

  constructor(
    deps: Exp021LifecycleDeps,
    ports: Exp021LifecyclePorts,
    motionThresholds?: {
      parkedSpeedKmh: number;
      movementSpeedKmh: number;
      driveEndCandidateParkedSec: number;
      driveEndParkedSec: number;
    },
  ) {
    this.deps = deps;
    this.ports = ports;
    const thresholds = motionThresholds ?? {
      parkedSpeedKmh: deps.config.parkedSpeedKmh,
      movementSpeedKmh: deps.config.movementSpeedKmh,
      driveEndCandidateParkedSec: deps.config.driveEndCandidateParkedSec,
      driveEndParkedSec: deps.config.driveEndParkedSec,
    };
    this.physicalStartDetector = new PhysicalStartDetector({
      ...EXP021_DEFAULT_PHYSICAL_START,
      movementSpeedKmh: thresholds.movementSpeedKmh,
    });
    this.physicalEndDetector = new PhysicalEndDetector({
      ...EXP021_DEFAULT_PHYSICAL_END,
      parkedSpeedKmh: thresholds.parkedSpeedKmh,
      movementSpeedKmh: thresholds.movementSpeedKmh,
      provisionalConfirmMs: thresholds.driveEndCandidateParkedSec * 1000,
      finalParkedMs: thresholds.driveEndParkedSec * 1000,
    });
  }

  private log(event: string, payload: Record<string, unknown> = {}): void {
    this.ports.log?.(event, payload);
  }

  classifyMotion(sample: SpeedSample): MotionState {
    const { config } = this.deps;
    return classifyMotionState(sample, config.parkedSpeedKmh, config.movementSpeedKmh);
  }

  resumeDrivingFromActivePhase(
    effectivePollIntervalMs: number,
    phaseStartedAt: string | null,
    phaseIndex: number,
  ): void {
    const { config } = this.deps;
    this.currentPhaseIndex = phaseIndex;
    this.phaseActivatedAtMs = phaseStartedAt ? Date.parse(phaseStartedAt) : this.ports.nowMs();
    this.phaseTracker.beginPhase(
      effectivePollIntervalMs,
      this.phaseActivatedAtMs,
      resolvePhaseAdvancementForIndex(config, phaseIndex),
    );
    this.physicalDriveStarted = true;
  }

  tryResumeFromRecordingSession(recording: {
    id: string;
    preflightJson: unknown;
    acquisitionStateJson: unknown;
  }): 'driving' | 'wait_movement' | 'no_t0' {
    const authority = parseExp021PhysicalAuthority(recording.preflightJson);
    this.sessionId = recording.id;
    if (!authority?.canonicalT0At) {
      return 'no_t0';
    }
    this.physicalDriveStarted = true;
    this.physicalDriveStartedAt = new Date(authority.canonicalT0At);
    this.orchestrationDegraded = authority.orchestrationState === 'DEGRADED';
    const st = parseAcquisitionState(recording.acquisitionStateJson);
    const ap = st.hfCalibrationSeries?.activePhase;
    if (ap?.phaseProvenance === 'PHYSICAL_T0' || ap?.phaseProvenance === 'PHYSICAL_TRANSITION') {
      const idx = Math.max(
        0,
        (this.deps.config.cadencePhaseOrderMs as readonly number[]).indexOf(
          ap.effectivePollIntervalMs,
        ),
      );
      this.resumeDrivingFromActivePhase(ap.effectivePollIntervalMs, ap.phaseStartedAt ?? null, idx);
      this.log('T0_RECOVERY_RESUME_DRIVING', {
        canonicalT0At: authority.canonicalT0At,
        orchestrationDegraded: this.orchestrationDegraded,
        activePhaseMs: ap.effectivePollIntervalMs,
      });
      return 'driving';
    }
    this.pendingT0PhaseActivation = true;
    this.log('RECOVER_T0_PHASE_ACTIVATION', {
      RECOVER_T0_PHASE_ACTIVATION: 'YES',
      canonicalT0At: authority.canonicalT0At,
      SECOND_T0_DETECTION_REQUIRED: 'NO',
    });
    return 'wait_movement';
  }

  async activatePhysicalPhaseFromPersistedAuthority(
    recoveryMode: 'T0_RECOVERY' | 'T0_CONFIRM',
  ): Promise<void> {
    const { config, sessionService, sessionRepo, settlementShadow } = this.deps;
    if (!this.sessionId) {
      throw new Error('missing session context for physical phase activation');
    }
    const firstCadenceMs = config.cadencePhaseOrderMs[0];
    const activation = await sessionService.activatePhysicalPhaseAtT0(
      config.organizationId,
      this.sessionId,
      { effectivePollIntervalMs: firstCadenceMs },
    );
    const phaseEffectiveAt = new Date(activation.phaseStartedAt);
    await syncExp021Settlement(settlementShadow, sessionRepo, config, this.sessionId);
    this.currentPhaseIndex = 0;
    this.phaseActivatedAtMs = phaseEffectiveAt.getTime();
    this.phaseTracker.beginPhase(
      firstCadenceMs,
      phaseEffectiveAt.getTime(),
      resolvePhaseAdvancementForIndex(config, 0),
    );
    this.pendingT0PhaseActivation = false;
    this.log('PHYSICAL_PHASE_60_REANCHORED_AT_T0', {
      PHASE_60_EFFECTIVE: 'YES',
      CALIBRATION_PLAN: config.calibrationPlan.planVersion,
      FIRST_CADENCE_MS: firstCadenceMs,
      REANCHORED: activation.reanchored ? 'YES' : 'NO',
      SEALED_PRE_ROLL_PHASE_ID: activation.sealedPreRollPhaseId,
      EFFECTIVE_AT: activation.phaseStartedAt,
      CANONICAL_T0_AT: activation.canonicalT0At,
      RECOVERY_MODE: recoveryMode,
      CANONICAL_T0_SOURCE: 'PERSISTED_AUTHORITY',
    });
  }

  async handlePendingT0PhaseActivation(): Promise<void> {
    if (!this.sessionId || !this.pendingT0PhaseActivation || !this.physicalDriveStarted) return;
    try {
      await this.activatePhysicalPhaseFromPersistedAuthority('T0_RECOVERY');
    } catch (phaseError) {
      this.orchestrationDegraded = true;
      await this.deps.sessionService.markExp021OrchestrationDegraded(
        this.deps.config.organizationId,
        this.sessionId,
        phaseError instanceof Error ? phaseError.message : String(phaseError),
      );
      this.log('ORCHESTRATION_DEGRADED', {
        ORCHESTRATION_STATE: 'DEGRADED',
        RAW_RC_CONTINUES: 'YES',
        PHASE_60_EFFECTIVE: 'NO',
        RECOVERY_RETRY_PENDING: 'YES',
        reason: phaseError instanceof Error ? phaseError.message : String(phaseError),
      });
    }
  }

  async handleWaitMovement(motion: SpeedSample): Promise<Exp021WaitMovementResult> {
    if (!this.sessionId) throw new Error('missing sessionId');
    await this.handlePendingT0PhaseActivation();
    if (this.pendingT0PhaseActivation && this.physicalDriveStarted) {
      return { status: 'continue' };
    }

    const nowMs = this.ports.nowMs();
    const motionState = this.classifyMotion(motion);
    if (!this.physicalDriveStarted) {
      this.physicalStartDetector.record(motion, nowMs, motionState);
    }
    if (!this.physicalDriveStarted && this.physicalStartDetector.isConfirmed()) {
      const confirmation = this.physicalStartDetector.getConfirmation();
      if (
        this.deployConvergedAtMs != null &&
        confirmation &&
        confirmation.firstQualifyingMovementAt.getTime() < this.deployConvergedAtMs
      ) {
        return {
          status: 'skipped',
          reason: 'PHYSICAL_START_BEFORE_DEPLOY_CONVERGENCE',
        };
      }
      const firstQualifyingMovementAt =
        confirmation?.firstQualifyingMovementAt ?? new Date(nowMs);
      const startConfirmedAt = confirmation?.startConfirmedAt ?? new Date(nowMs);

      const t0Persist = await this.deps.sessionService.persistExp021CanonicalT0(
        this.deps.config.organizationId,
        this.sessionId,
        { firstQualifyingMovementAt, startConfirmedAt, nowMs },
      );

      this.log('PHYSICAL_DRIVE_START_DETECTED', {
        PHYSICAL_DRIVE_START_DETECTED: 'YES',
        CANONICAL_T0_DURABLY_PERSISTED: 'YES',
        T0_PERSIST_CREATED: t0Persist.created ? 'YES' : 'NO',
        FIRST_QUALIFYING_MOVEMENT_AT: firstQualifyingMovementAt.toISOString(),
        START_CONFIRMED_AT: startConfirmedAt.toISOString(),
      });

      this.physicalDriveStarted = true;
      this.physicalDriveStartedAt = new Date(t0Persist.authority.canonicalT0At);

      try {
        await this.activatePhysicalPhaseFromPersistedAuthority('T0_CONFIRM');
      } catch (phaseError) {
        this.orchestrationDegraded = true;
        this.pendingT0PhaseActivation = true;
        await this.deps.sessionService.markExp021OrchestrationDegraded(
          this.deps.config.organizationId,
          this.sessionId,
          phaseError instanceof Error ? phaseError.message : String(phaseError),
        );
        this.log('ORCHESTRATION_DEGRADED', {
          ORCHESTRATION_STATE: 'DEGRADED',
          RECOVERY_RETRY_PENDING: 'YES',
          reason: phaseError instanceof Error ? phaseError.message : String(phaseError),
        });
      }
      this.physicalStartDetector.reset();
      return { status: 't0_confirmed' };
    }
    return { status: 'continue' };
  }

  async tickDriving(motion: SpeedSample): Promise<Exp021DrivingTickResult> {
    const { config, sessionService, sessionRepo, settlementShadow } = this.deps;
    if (!this.sessionId) throw new Error('missing sessionId');
    const nowMs = this.ports.nowMs();
    const motionState = this.classifyMotion(motion);
    this.phaseTracker.tick(motionState, nowMs);

    if (
      !this.physicalDriveEnded &&
      this.currentPhaseIndex >= 0 &&
      this.currentPhaseIndex < config.cadencePhaseOrderMs.length - 1 &&
      this.phaseTracker.shouldAdvancePhase(nowMs)
    ) {
      const nextIndex = this.currentPhaseIndex + 1;
      const next = config.cadencePhaseOrderMs[nextIndex];
      try {
        const sessionBefore = await sessionRepo.findById(config.organizationId, this.sessionId);
        const completingPhaseId =
          parseAcquisitionState(sessionBefore?.acquisitionStateJson).hfCalibrationSeries
            ?.activePhase?.calibrationPhaseId ?? null;
        await sessionService.switchHfCalibrationPhase(config.organizationId, this.sessionId, {
          effectivePollIntervalMs: next,
          phaseProvenance: 'PHYSICAL_TRANSITION',
        });
        const effectiveAt = await this.ports.waitPhaseEffective(this.sessionId, next);
        const completed = this.phaseTracker.advancePhaseAtEffectiveBoundary(
          effectiveAt.getTime(),
          next,
          resolvePhaseAdvancementForIndex(config, nextIndex),
        );
        if (completed && completingPhaseId) {
          await sessionService.persistExp021ActivePhaseMovementMetrics(
            config.organizationId,
            this.sessionId,
            {
              calibrationPhaseId: completingPhaseId,
              validMovementDurationMs: completed.validMovementDurationMs,
              uncertainMovementDurationMs: completed.uncertainMovementDurationMs,
            },
          );
        }
        await syncExp021Settlement(settlementShadow, sessionRepo, config, this.sessionId);
        this.currentPhaseIndex += 1;
        this.phaseActivatedAtMs = effectiveAt.getTime();
        this.log('PHASE_TRANSITION', {
          phaseIndex: this.currentPhaseIndex,
          effectivePollIntervalMs: next,
          effectivePhaseStartedAt: effectiveAt.toISOString(),
        });
      } catch (transitionError) {
        this.orchestrationDegraded = true;
        await sessionService.markExp021OrchestrationDegraded(
          config.organizationId,
          this.sessionId,
          transitionError instanceof Error ? transitionError.message : String(transitionError),
        );
        this.log('ORCHESTRATION_DEGRADED', {
          ORCHESTRATION_STATE: 'DEGRADED',
          PHASE_TRANSITION_FAILED: 'YES',
          reason:
            transitionError instanceof Error ? transitionError.message : String(transitionError),
        });
      }
    }

    const endObservation = this.physicalEndDetector.observe(motion, motionState, nowMs);
    if (endObservation.candidateInvalidated && this.physicalDriveEndCandidateId) {
      await settlementShadow.invalidatePhysicalDriveIntervalCandidate({
        sessionId: this.sessionId,
        candidateId: this.physicalDriveEndCandidateId,
        reason: 'movement_resumed_after_end_candidate',
      });
      this.physicalDriveEndCandidateId = null;
    }

    if (endObservation.candidateConfirmed && this.physicalDriveEndCandidateId) {
      await settlementShadow.confirmPhysicalDriveIntervalCandidate({
        sessionId: this.sessionId,
        candidateId: this.physicalDriveEndCandidateId,
        reason: 'sustained_distinct_parked_evidence',
      });
    }

    if (endObservation.newProvisionalCandidate && this.physicalDriveStartedAt && this.sessionId) {
      const candidate = endObservation.newProvisionalCandidate;
      this.physicalDriveEndCandidateId = candidate.candidateId;
      const scheduleCreatedAt = new Date(nowMs);
      await settlementShadow.schedulePhysicalDriveIntervalShadow({
        sessionId: this.sessionId,
        organizationId: config.organizationId,
        vehicleId: config.vehicleId,
        tokenId: config.tokenId,
        driveStartedAt: this.physicalDriveStartedAt,
        driveEndedAt: candidate.candidateBoundaryAt,
        candidateId: candidate.candidateId,
        candidateBoundaryAt: candidate.candidateBoundaryAt,
        candidateStatus: candidate.candidateStatus,
        scheduleCreatedAt,
      });
      this.physicalEndDetector.markSchedulesCreated(scheduleCreatedAt);
    }

    const lastPhaseIndex = config.cadencePhaseOrderMs.length - 1;
    const finalPhaseWallClockExpired =
      !this.physicalDriveEnded &&
      this.currentPhaseIndex === lastPhaseIndex &&
      this.phaseTracker.shouldAdvancePhase(nowMs);
    const hardPhysicalEndEligible = this.physicalEndDetector.hardPhysicalEndEligible(
      nowMs,
      motionState,
    );

    if (this.physicalDriveStarted && (hardPhysicalEndEligible || finalPhaseWallClockExpired)) {
      this.physicalDriveEnded = true;
      const stopReason = finalPhaseWallClockExpired
        ? 'FINAL_PHASE_WALL_CLOCK'
        : 'PHYSICAL_RUN_ENDED_EARLY';
      await completeExp021PhysicalRunAndStop({
        sessionService,
        settlementShadow,
        config,
        sessionId: this.sessionId,
        phaseTracker: this.phaseTracker,
        physicalEndDetector: this.physicalEndDetector,
        physicalDriveEndCandidateId: this.physicalDriveEndCandidateId,
        physicalDriveStartedAt: this.physicalDriveStartedAt,
        nowMs,
        reason: stopReason,
      });
      this.log('AUTO_STOP_RECORDING', {
        physicalDriveEnded: true,
        STOP_REASON: stopReason,
      });
      return { status: 'done', stopReason };
    }

    return { status: 'continue' };
  }
}

export function parseAuthorityFromPreflight(preflightJson: unknown): Exp021PhysicalAuthority | null {
  return parseExp021PhysicalAuthority(preflightJson);
}
