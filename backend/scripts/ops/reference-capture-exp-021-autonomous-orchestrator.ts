/**
 * EXP-021 KS MS 661 — autonomous deploy-wait + pre-roll + drive orchestrator.
 * Production VPS only. Logs to EXP021_AUTONOMOUS_LOG_PATH.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoAuthService } from '../../src/modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../src/modules/dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../src/modules/dimo/provider/dimo-provider-request-context.util';
import { buildBroadReferenceSignalsLatestQuery } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-query-builder';
import { buildAvailableSignalsQuery } from '../../src/modules/dimo/queries/available-signals.query';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { ReferenceCaptureSessionRepository, parseAcquisitionState } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { ReferenceCaptureConfig } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.config';
import { ReferenceCaptureSettlementShadowService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.service';
import Redis from 'ioredis';
import {
  acquireOrchestratorLock,
  buildExp021RuntimeConfig,
  buildOrchestratorLockKey,
  evaluateEffectivePolicyGate,
  extendOrchestratorLock,
  EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY,
  isOrchestratorOwnedRecordingSession,
  loadBackendEnvFile,
  releaseOrchestratorLock,
  resolveFatalSessionCleanupMode,
  resolvePhaseAdvancementForIndex,
  type Exp021RuntimeConfig,
  type OrchestratorLockHandle,
} from './reference-capture-exp-021-autonomous-orchestrator.lib';
import {
  classifyMotionState,
  EXP021_DEFAULT_PHYSICAL_END,
  EXP021_DEFAULT_PHYSICAL_START,
  EXP021_DEFAULT_TELEMETRY_FRESHNESS,
  EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
  parseSpeedSampleFromSignalsLatest,
  EXP021_DEFAULT_PRE_DEPLOY_MOVEMENT,
  PhysicalDrivePhaseTracker,
  PhysicalEndDetector,
  PhysicalStartDetector,
  PreDeployMovementGate,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-motion.lib';
import { resolvePhysicalEndSealMs } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-physical-authority.lib';
import {
  classifyOrchestratorFailure,
  parseExp021PhysicalAuthority,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-physical-authority.lib';

type Phase =
  | 'WAIT_DEPLOY'
  | 'PREP'
  | 'WAIT_TELEMETRY'
  | 'WAIT_MOVEMENT'
  | 'DRIVING'
  | 'DONE'
  | 'SKIPPED';

function log(config: Exp021RuntimeConfig, event: string, payload: Record<string, unknown> = {}): void {
  const row = JSON.stringify({ at: new Date().toISOString(), event, ...payload });
  fs.mkdirSync(path.dirname(config.logPath), { recursive: true });
  fs.appendFileSync(config.logPath, row + '\n');
  console.log(row);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function deployProcessRunning(): boolean {
  try {
    const out = execSync('ps aux', { encoding: 'utf8' });
    return out.includes('vps-deploy-release.sh') || /\bnpm run build\b/.test(out);
  } catch {
    return false;
  }
}

function currentReleaseSha(): string {
  try {
    return execSync('git -C /opt/synqdrive/current rev-parse HEAD', { encoding: 'utf8' }).trim().toLowerCase();
  } catch {
    return '';
  }
}

function replicaHealthy(port: number): boolean {
  try {
    execSync(`curl -sf http://127.0.0.1:${port}/api/v1/health`, { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function externalHealthy(): boolean {
  try {
    execSync('curl -sf https://app.synqdrive.eu/api/v1/health', { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function redisHealthy(): boolean {
  try {
    const pong = execSync('redis-cli ping', { encoding: 'utf8' }).trim();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

function redisConnection(): { host: string; port: number; password?: string; db?: number } {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : undefined,
  };
}

function tripFsmR12Present(): boolean {
  try {
    const grep = execSync(
      'grep -r "provider stop boundary\\|R12\\|boundary-backed" /opt/synqdrive/current/backend/src/modules --include="*.ts" -l | head -1',
      { encoding: 'utf8' },
    ).trim();
    return grep.length > 0;
  } catch {
    return false;
  }
}

async function queryMotionSample(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  config: Exp021RuntimeConfig,
): Promise<ReturnType<typeof parseSpeedSampleFromSignalsLatest> & { liveReady: boolean }> {
  const dimoAuth = app.get(DimoAuthService);
  const dimoTelemetry = app.get(DimoTelemetryService);
  const jwt = await dimoAuth.getVehicleJwt(config.tokenId);
  const providerContext = buildDimoProviderRequestContext(config.tokenId, {
    organizationId: config.organizationId,
    vehicleId: config.vehicleId,
  });
  const avail = await dimoTelemetry.queryGraphQLWithIngressTiming(
    jwt,
    buildAvailableSignalsQuery(config.tokenId),
    undefined,
    providerContext,
    'REFERENCE_CAPTURE',
  );
  const signals: string[] = Array.isArray(avail.result?.data?.availableSignals)
    ? avail.result.data.availableSignals.filter((s: unknown): s is string => typeof s === 'string')
    : [];
  const latest = await dimoTelemetry.queryGraphQLWithIngressTiming(
    jwt,
    buildBroadReferenceSignalsLatestQuery(config.tokenId, signals),
    undefined,
    providerContext,
    'REFERENCE_CAPTURE',
  );
  const signalsLatest = (latest.result?.data?.signalsLatest ?? {}) as Record<
    string,
    { timestamp?: string; value?: unknown }
  >;
  const nowMs = Date.now();
  const sample = parseSpeedSampleFromSignalsLatest(signalsLatest, nowMs, {
    vehicleTelemetryFreshThresholdMs: config.freshThresholdSec * 1000,
    speedSignalFreshThresholdMs: EXP021_DEFAULT_TELEMETRY_FRESHNESS.speedSignalFreshThresholdMs,
  });
  const liveReady = sample.vehicleTelemetryFresh;
  return { ...sample, liveReady };
}

async function syncSettlement(
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

async function waitForRecordingCycles(
  sessionRepo: ReferenceCaptureSessionRepository,
  config: Exp021RuntimeConfig,
  sessionId: string,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const s = await sessionRepo.findById(config.organizationId, sessionId);
    const st = parseAcquisitionState(s?.acquisitionStateJson);
    if (s?.status === 'RECORDING' && (st.cycleCount ?? 0) >= 1) return;
    if (s?.status === 'FAILED' || s?.status === 'ABORTED') throw new Error(`session terminal ${s?.status}`);
  }
  throw new Error('recording cycles not observed');
}

async function completePhysicalRunAndStop(args: {
  sessionService: ReferenceCaptureSessionService;
  settlementShadow: ReferenceCaptureSettlementShadowService;
  prisma: PrismaService;
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

async function waitPhaseEffective(
  sessionRepo: ReferenceCaptureSessionRepository,
  config: Exp021RuntimeConfig,
  sessionId: string,
  pollMs: number,
): Promise<Date> {
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const s = await sessionRepo.findById(config.organizationId, sessionId);
    const st = parseAcquisitionState(s?.acquisitionStateJson);
    const ap = st.hfCalibrationSeries?.activePhase;
    if (ap?.effectivePollIntervalMs === pollMs && ap?.phaseStartedAt) {
      return new Date(ap.phaseStartedAt);
    }
  }
  throw new Error(`phase ${pollMs}ms not effective`);
}

async function terminalizeSessionAfterFatal(
  organizationId: string,
  sessionId: string,
  sessionService: ReferenceCaptureSessionService,
  sessionRepo: ReferenceCaptureSessionRepository,
  reason: string,
): Promise<{ cleanupMode: string; cleanupStatus: string; cleanupError?: string }> {
  const session = await sessionRepo.findById(organizationId, sessionId);
  const cleanupMode = resolveFatalSessionCleanupMode(session?.acquisitionStateJson);
  try {
    if (cleanupMode === 'stop') {
      const stopped = await sessionService.stopRecording(organizationId, sessionId);
      return { cleanupMode, cleanupStatus: stopped.status };
    }
    const aborted = await sessionService.abortSession(organizationId, sessionId, reason);
    return { cleanupMode, cleanupStatus: aborted.status };
  } catch (cleanupError) {
    return {
      cleanupMode,
      cleanupStatus: 'CLEANUP_FAILED',
      cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    };
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-exp021-autonomous')) {
    throw new Error('Refusing without --confirm-exp021-autonomous');
  }
  loadBackendEnvFile();
  const config = buildExp021RuntimeConfig();
  const orchestratorRunId = `exp021-${Date.now()}`;
  log(config, 'ORCHESTRATOR_START', {
    TARGET_SHA: config.targetDeploySha,
    ORG: config.organizationId,
    VEH: config.vehicleId,
    TOKEN: config.tokenId,
    PLATE: config.licensePlate,
    orchestratorRunId,
  });

  const redis = new Redis(redisConnection());
  const lockKey = buildOrchestratorLockKey(config.organizationId, config.vehicleId);
  const lockResult = await acquireOrchestratorLock(redis, lockKey);
  if (!lockResult.acquired) {
    log(config, 'ORCHESTRATOR_FATAL', {
      error: 'competing orchestrator instance holds lock',
      lockReason: lockResult.reason,
      DUPLICATE_INSTANCE_FAIL_CLOSED: 'YES',
    });
    await redis.quit();
    process.exit(1);
  }
  const lockHandle: OrchestratorLockHandle = lockResult.handle;
  log(config, 'ORCHESTRATOR_LOCK_ACQUIRED', { lockKey, DUPLICATE_INSTANCE_FAIL_CLOSED: 'YES' });

  let phase: Phase = 'WAIT_DEPLOY';
  let sessionId: string | null = null;
  let sessionStarted = false;
  let deployReady = false;
  let policyGatePassed = false;
  let movementBeforeDeploy = false;
  let deployConvergedAtMs: number | null = null;
  const preDeployMovementGate = new PreDeployMovementGate({
    ...EXP021_DEFAULT_PRE_DEPLOY_MOVEMENT,
    movementSpeedKmh: config.movementSpeedKmh,
  });
  let physicalDriveStarted = false;
  let physicalDriveEnded = false;
  let orchestrationDegraded = false;
  let preRollStarted = false;
  let currentPhaseIndex = -1;
  let phaseActivatedAtMs: number | null = null;
  let physicalDriveStartedAt: Date | null = null;
  let physicalDriveEndCandidateId: string | null = null;
  let pendingT0PhaseActivation = false;
  const physicalStartDetector = new PhysicalStartDetector({
    ...EXP021_DEFAULT_PHYSICAL_START,
    movementSpeedKmh: config.movementSpeedKmh,
  });
  const physicalEndDetector = new PhysicalEndDetector({
    ...EXP021_DEFAULT_PHYSICAL_END,
    parkedSpeedKmh: config.parkedSpeedKmh,
    movementSpeedKmh: config.movementSpeedKmh,
    provisionalConfirmMs: config.driveEndCandidateParkedSec * 1000,
    finalParkedMs: config.driveEndParkedSec * 1000,
  });
  const phaseTracker = new PhysicalDrivePhaseTracker();
  let fatalError: Error | null = null;

  type AppContext = Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let app: AppContext | undefined;
  let prisma: PrismaService | undefined;
  let sessionService: ReferenceCaptureSessionService | undefined;
  let sessionRepo: ReferenceCaptureSessionRepository | undefined;
  let settlementShadow: ReferenceCaptureSettlementShadowService | undefined;
  let rcConfig: ReferenceCaptureConfig | undefined;

  async function ensureApp(): Promise<void> {
    if (app) return;
    const appModule = await AppModule.forRootAsync();
    app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });
    prisma = app.get(PrismaService);
    sessionService = app.get(ReferenceCaptureSessionService);
    sessionRepo = app.get(ReferenceCaptureSessionRepository);
    settlementShadow = app.get(ReferenceCaptureSettlementShadowService);
    rcConfig = app.get(ReferenceCaptureConfig);
  }

  async function activatePhysicalPhaseFromPersistedAuthority(
    recoveryMode: 'T0_RECOVERY' | 'T0_CONFIRM',
  ): Promise<void> {
    if (!sessionId || !sessionService) {
      throw new Error('missing session context for physical phase activation');
    }
    const firstCadenceMs = config.cadencePhaseOrderMs[0];
    const activation = await sessionService.activatePhysicalPhaseAtT0(
      config.organizationId,
      sessionId,
      { effectivePollIntervalMs: firstCadenceMs },
    );
    const phase60EffectiveAt = new Date(activation.phaseStartedAt);
    await syncSettlement(settlementShadow!, sessionRepo!, config, sessionId);
    currentPhaseIndex = 0;
    phaseActivatedAtMs = phase60EffectiveAt.getTime();
    phaseTracker.beginPhase(
      firstCadenceMs,
      phase60EffectiveAt.getTime(),
      resolvePhaseAdvancementForIndex(config, 0),
    );
    phase = 'DRIVING';
    pendingT0PhaseActivation = false;
    log(config, 'PHYSICAL_PHASE_60_REANCHORED_AT_T0', {
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
    log(config, 'PHASE_60_PHYSICAL_BOUNDARY', {
      PHASE_60_EFFECTIVE: 'YES',
      EFFECTIVE_AT: phase60EffectiveAt.toISOString(),
    });
  }

  let running = true;
  try {
    while (running) {
      try {
      const lockExtended = await extendOrchestratorLock(redis, lockHandle);
      if (!lockExtended) {
        throw new Error('orchestrator lock lease lost — fail closed');
      }
      const sha = currentReleaseSha();
      const deployRunning = deployProcessRunning();
      const r3001 = replicaHealthy(3001);
      const r3002 = replicaHealthy(3002);
      const ext = externalHealthy();
      let motion: Awaited<ReturnType<typeof queryMotionSample>> | null = null;
      if (deployReady || !deployRunning) {
        await ensureApp();
        try {
          motion = await queryMotionSample(app!, config);
        } catch (motionError) {
          const motionErr =
            motionError instanceof Error ? motionError : new Error(String(motionError));
          const motionFailureClass = classifyOrchestratorFailure(motionErr);
          if (motionFailureClass === 'integrity_fatal') {
            throw motionErr;
          }
          log(config, motionFailureClass === 'transient_provider' ? 'TRANSIENT_PROVIDER_ERROR' : 'RECOVERABLE_ORCHESTRATION_ERROR', {
            ORCHESTRATOR_REMAINS_ALIVE: 'YES',
            RAW_RC_CONTINUES: 'YES',
            error: motionErr.message,
          });
          await sleep(config.pollMs);
          continue;
        }
      }

      if (!deployReady) {
        if (!deployRunning && sha === config.targetDeploySha && r3001 && r3002 && ext && redisHealthy()) {
          physicalStartDetector.reset();
          preDeployMovementGate.reset();
          deployConvergedAtMs = Date.now();
          deployReady = true;
          log(config, 'DEPLOY_CONVERGED', {
            DEPLOY_PROCESS_FINISHED: 'YES',
            DEPLOY_RESULT: 'SUCCESS',
            PRODUCTION_SHA: sha,
            REPLICA_3001_HEALTHY: 'YES',
            REPLICA_3002_HEALTHY: 'YES',
            REPLICA_3001_SHA: sha,
            REPLICA_3002_SHA: sha,
            PRODUCTION_SHA_CONVERGED: 'YES',
            TRIP_FSM_NEW_VERSION_PRESENT: tripFsmR12Present() ? 'YES' : 'NO',
          });
          phase = 'PREP';
          // fall through to PREP handling in same iteration
        } else if (motion) {
          const deployMotion = classifyMotionState(
            motion,
            config.parkedSpeedKmh,
            config.movementSpeedKmh,
          );
          preDeployMovementGate.record(motion, deployMotion, Date.now());
          if (preDeployMovementGate.isDriveStartBeforeDeploy()) {
            movementBeforeDeploy = true;
          }
        }

        if (movementBeforeDeploy && !deployReady) {
          phase = 'SKIPPED';
          log(config, 'EXP021_RUN_SKIPPED', {
            EXP021_RUN_SKIPPED_REASON: 'DEPLOY_NOT_READY_BEFORE_DRIVE_START',
          });
          running = false;
          break;
        }

        if (!deployReady) {
          log(config, 'DEPLOY_WAIT', {
            deployRunning,
            sha,
            TARGET_SHA: config.targetDeploySha,
            r3001,
            r3002,
            ext,
            speedKmh: motion?.speedKmh ?? null,
            motionState: motion
              ? classifyMotionState(motion, config.parkedSpeedKmh, config.movementSpeedKmh)
              : 'UNKNOWN',
          });
          await sleep(config.pollMs);
          continue;
        }
      }

      if (phase === 'PREP') {
        await ensureApp();
        if (!policyGatePassed) {
          const gate = evaluateEffectivePolicyGate(rcConfig!.getHfRecoveryPolicyConfig(), config.tokenId);
          log(config, 'EFFECTIVE_POLICY_PRECHECK', {
            EFFECTIVE_HF_POLICY_MODE: gate.effectiveMode,
            CALIBRATION_PHASE_ACTIVATION_ALLOWED: gate.allowed ? 'YES' : 'NO',
            blocker: gate.blocker ?? null,
          });
          if (!gate.allowed) {
            throw new Error(gate.blocker ?? 'HF V2 policy gate failed before session creation');
          }
          policyGatePassed = true;
        }

        const fsm = await prisma!.vehicleTripDetectionState.findUnique({
          where: { vehicleId: config.vehicleId },
        });
        const lastTrip = await prisma!.vehicleTrip.findFirst({
          where: { vehicleId: config.vehicleId },
          orderBy: { startTime: 'desc' },
        });
        log(config, 'TRIP_FSM_POST_DEPLOY', {
          tripFsmState: fsm?.state,
          activeTripId: fsm?.activeTripId,
          lastTrip: lastTrip
            ? { id: lastTrip.id, tripStatus: lastTrip.tripStatus, end: lastTrip.endTime?.toISOString() }
            : null,
        });

        const recording = await prisma!.referenceCaptureSession.findFirst({
          where: {
            organizationId: config.organizationId,
            vehicleId: config.vehicleId,
            status: 'RECORDING',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (recording) {
          const owned = isOrchestratorOwnedRecordingSession(recording.preflightJson, orchestratorRunId);
          if (!owned) {
            throw new Error(
              `Refusing ATTACH_EXISTING_RECORDING without orchestrator ownership session=${recording.id}`,
            );
          }
          sessionId = recording.id;
          sessionStarted = true;
          preRollStarted = true;
          const authority = parseExp021PhysicalAuthority(recording.preflightJson);
          if (authority?.canonicalT0At) {
            physicalDriveStarted = true;
            physicalDriveStartedAt = new Date(authority.canonicalT0At);
            orchestrationDegraded = authority.orchestrationState === 'DEGRADED';
            const st = parseAcquisitionState(recording.acquisitionStateJson);
            const ap = st.hfCalibrationSeries?.activePhase;
            if (ap?.phaseProvenance === 'PHYSICAL_T0' || ap?.phaseProvenance === 'PHYSICAL_TRANSITION') {
              currentPhaseIndex = Math.max(
                0,
                (config.cadencePhaseOrderMs as readonly number[]).indexOf(
                  ap.effectivePollIntervalMs,
                ),
              );
              phaseActivatedAtMs = ap.phaseStartedAt ? Date.parse(ap.phaseStartedAt) : null;
              phaseTracker.beginPhase(
                ap.effectivePollIntervalMs,
                phaseActivatedAtMs ?? Date.now(),
                resolvePhaseAdvancementForIndex(config, currentPhaseIndex),
              );
              phase = 'DRIVING';
              log(config, 'T0_RECOVERY_RESUME_DRIVING', {
                canonicalT0At: authority.canonicalT0At,
                orchestrationDegraded,
                activePhaseMs: ap.effectivePollIntervalMs,
              });
            } else {
              pendingT0PhaseActivation = true;
              phase = 'WAIT_MOVEMENT';
              log(config, 'RECOVER_T0_PHASE_ACTIVATION', {
                RECOVER_T0_PHASE_ACTIVATION: 'YES',
                canonicalT0At: authority.canonicalT0At,
                SECOND_T0_DETECTION_REQUIRED: 'NO',
              });
            }
          } else {
            phase = 'WAIT_MOVEMENT';
          }
          log(config, 'ATTACH_EXISTING_RECORDING', { sessionId, orchestratorRunId });
          await sleep(config.pollMs);
          continue;
        }

        const staleReady = await prisma!.referenceCaptureSession.findMany({
          where: {
            organizationId: config.organizationId,
            vehicleId: config.vehicleId,
            status: { in: ['READY', 'STARTING'] },
          },
        });
        for (const stale of staleReady) {
          await sessionService!.abortSession(
            config.organizationId,
            stale.id,
            'exp021_autonomous_fresh_session_replace',
          );
          log(config, 'ABORTED_STALE_READY', { sessionId: stale.id });
        }

        const created = await sessionService!.createSession({
          organizationId: config.organizationId,
          vehicleId: config.vehicleId,
          groundTruthVideoRef: null,
        });
        const preflight = await sessionService!.runPreflight(config.organizationId, created.id);
        if (preflight.status !== 'READY') throw new Error(`preflight not READY: ${preflight.status}`);
        sessionId = created.id;
        await prisma!.referenceCaptureSession.update({
          where: { id: sessionId },
          data: {
            preflightJson: {
              ...((preflight.preflight ?? {}) as Record<string, unknown>),
              [EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY]: {
                runId: orchestratorRunId,
                startedAt: new Date().toISOString(),
              },
            },
          },
        });
        log(config, 'NEW_SESSION_READY', {
          sessionId,
          PREARM_READY: preflight.readiness?.deploymentPreflightReady,
        });
        phase = 'WAIT_TELEMETRY';
        await sleep(config.pollMs);
        continue;
      }

      if (phase === 'WAIT_TELEMETRY') {
        if (!motion?.liveReady) {
          log(config, 'WAIT_TELEMETRY', {
            speedKmh: motion?.speedKmh ?? null,
            speedAgeMs: motion?.speedAgeMs ?? null,
            vehicleTelemetryFresh: motion?.vehicleTelemetryFresh ?? false,
            speedSignalFresh: motion?.speedSignalFresh ?? false,
          });
          await sleep(config.pollMs);
          continue;
        }

        if (!sessionId) throw new Error('missing sessionId');
        const competing = await prisma!.referenceCaptureSession.count({
          where: {
            organizationId: config.organizationId,
            status: 'RECORDING',
            id: { not: sessionId },
          },
        });
        if (competing > 0) throw new Error('competing RECORDING session exists');

        const preRollMotion = classifyMotionState(
          motion!,
          config.parkedSpeedKmh,
          config.movementSpeedKmh,
        );

        const sess = await sessionRepo!.findById(config.organizationId, sessionId);
        if (sess?.status === 'RECORDING') {
          preRollStarted = true;
          phase = 'WAIT_MOVEMENT';
          await sleep(config.pollMs);
          continue;
        }
        if (sess?.status !== 'READY') throw new Error(`session not READY: ${sess?.status}`);

        await sessionService!.startRecording(config.organizationId, sessionId);
        sessionStarted = true;
        await waitForRecordingCycles(sessionRepo!, config, sessionId);
        preRollStarted = true;
        log(config, 'AUTO_START_RECORDING_CALLED', {
          AUTO_START_RECORDING_CALLED: 'YES',
          SESSION_ID: sessionId,
          SESSION_STATUS: 'RECORDING',
          LIVE_TELEMETRY_READY: 'YES',
          PRE_ROLL_COMPLETE: preRollMotion === 'PARKED_CANDIDATE' ? 'YES' : 'PARTIAL',
          FIRST_FRESH_SAMPLE_MOVING: preRollMotion === 'MOVING' ? 'YES' : 'NO',
          AUTONOMOUS_WAKE_AND_GO_SUPPORTED: 'YES',
        });
        phase = 'WAIT_MOVEMENT';
        await sleep(config.pollMs);
        continue;
      }

      if (phase === 'WAIT_MOVEMENT') {
        if (!sessionId) throw new Error('missing sessionId');
        if (pendingT0PhaseActivation && physicalDriveStarted) {
          try {
            await activatePhysicalPhaseFromPersistedAuthority('T0_RECOVERY');
          } catch (phaseError) {
            orchestrationDegraded = true;
            await sessionService!.markExp021OrchestrationDegraded(
              config.organizationId,
              sessionId,
              phaseError instanceof Error ? phaseError.message : String(phaseError),
            );
            phase = 'DRIVING';
            log(config, 'ORCHESTRATION_DEGRADED', {
              ORCHESTRATION_STATE: 'DEGRADED',
              RAW_RC_CONTINUES: 'YES',
              PHASE_60_EFFECTIVE: 'NO',
              RECOVERY_RETRY_PENDING: pendingT0PhaseActivation ? 'YES' : 'NO',
              reason: phaseError instanceof Error ? phaseError.message : String(phaseError),
            });
          }
          await sleep(config.pollMs);
          continue;
        }
        if (!motion) {
          await sleep(config.pollMs);
          continue;
        }
        const nowMs = Date.now();
        const motionState = classifyMotionState(
          motion,
          config.parkedSpeedKmh,
          config.movementSpeedKmh,
        );
        if (!physicalDriveStarted) {
          physicalStartDetector.record(motion, nowMs, motionState);
        }
        if (!physicalDriveStarted && physicalStartDetector.isConfirmed()) {
          const confirmation = physicalStartDetector.getConfirmation();
          if (
            deployConvergedAtMs != null &&
            confirmation &&
            confirmation.firstQualifyingMovementAt.getTime() < deployConvergedAtMs
          ) {
            phase = 'SKIPPED';
            log(config, 'EXP021_RUN_SKIPPED', {
              EXP021_RUN_SKIPPED_REASON: 'PHYSICAL_START_BEFORE_DEPLOY_CONVERGENCE',
              DRIVE_STARTED_BEFORE_DEPLOY_FAILS_CLOSED: 'YES',
              firstQualifyingMovementAt: confirmation.firstQualifyingMovementAt.toISOString(),
              deployConvergedAt: new Date(deployConvergedAtMs).toISOString(),
            });
            running = false;
            break;
          }
          const firstQualifyingMovementAt =
            confirmation?.firstQualifyingMovementAt ?? new Date(nowMs);
          const startConfirmedAt = confirmation?.startConfirmedAt ?? new Date(nowMs);

          const t0Persist = await sessionService!.persistExp021CanonicalT0(
            config.organizationId,
            sessionId,
            { firstQualifyingMovementAt, startConfirmedAt, nowMs },
          );

          log(config, 'PHYSICAL_DRIVE_START_DETECTED', {
            PHYSICAL_DRIVE_START_DETECTED: 'YES',
            CANONICAL_T0_DURABLY_PERSISTED: 'YES',
            T0_PERSIST_CREATED: t0Persist.created ? 'YES' : 'NO',
            FIRST_QUALIFYING_MOVEMENT_AT: firstQualifyingMovementAt.toISOString(),
            START_CONFIRMED_AT: startConfirmedAt.toISOString(),
            START_DETECTION_LATENCY_MS: confirmation?.startDetectionLatencyMs,
            speedKmh: motion.speedKmh,
            SPEED_PROVIDER_FIELD: motion.speedProviderField,
            SPEED_TIMESTAMP: motion.speedTimestamp,
            SPEED_AGE_MS: motion.speedAgeMs,
            distinctMovingSamples: physicalStartDetector.getQualifyingSampleCount(),
          });

          physicalDriveStarted = true;
          physicalDriveStartedAt = new Date(t0Persist.authority.canonicalT0At);

          try {
            await activatePhysicalPhaseFromPersistedAuthority('T0_CONFIRM');
          } catch (phaseError) {
            orchestrationDegraded = true;
            pendingT0PhaseActivation = true;
            await sessionService!.markExp021OrchestrationDegraded(
              config.organizationId,
              sessionId,
              phaseError instanceof Error ? phaseError.message : String(phaseError),
            );
            phase = 'DRIVING';
            log(config, 'ORCHESTRATION_DEGRADED', {
              ORCHESTRATION_STATE: 'DEGRADED',
              RAW_RC_CONTINUES: 'YES',
              PHASE_60_EFFECTIVE: 'NO',
              RECOVERY_RETRY_PENDING: 'YES',
              reason: phaseError instanceof Error ? phaseError.message : String(phaseError),
            });
          }
          physicalStartDetector.reset();
        }
        await sleep(config.pollMs);
        continue;
      }

      if (phase === 'DRIVING') {
        if (!sessionId) throw new Error('missing sessionId');
        if (!motion) {
          await sleep(config.pollMs);
          continue;
        }
        const nowMs = Date.now();
        const motionState = classifyMotionState(
          motion,
          config.parkedSpeedKmh,
          config.movementSpeedKmh,
        );
        phaseTracker.tick(motionState, nowMs);

        if (
          !physicalDriveEnded &&
          currentPhaseIndex >= 0 &&
          currentPhaseIndex < config.cadencePhaseOrderMs.length - 1 &&
          phaseTracker.shouldAdvancePhase(nowMs)
        ) {
          const nextIndex = currentPhaseIndex + 1;
          const next = config.cadencePhaseOrderMs[nextIndex];
          try {
            const sessionBefore = await sessionRepo!.findById(config.organizationId, sessionId);
            const completingPhaseId =
              parseAcquisitionState(sessionBefore?.acquisitionStateJson).hfCalibrationSeries
                ?.activePhase?.calibrationPhaseId ?? null;
            await sessionService!.switchHfCalibrationPhase(config.organizationId, sessionId, {
              effectivePollIntervalMs: next,
              phaseProvenance: 'PHYSICAL_TRANSITION',
            });
            const effectiveAt = await waitPhaseEffective(sessionRepo!, config, sessionId, next);
            const completed = phaseTracker.advancePhaseAtEffectiveBoundary(
              effectiveAt.getTime(),
              next,
              resolvePhaseAdvancementForIndex(config, nextIndex),
            );
            if (completed && completingPhaseId) {
              await sessionService!.persistExp021ActivePhaseMovementMetrics(
                config.organizationId,
                sessionId,
                {
                  calibrationPhaseId: completingPhaseId,
                  validMovementDurationMs: completed.validMovementDurationMs,
                  uncertainMovementDurationMs: completed.uncertainMovementDurationMs,
                },
              );
            }
            await syncSettlement(settlementShadow!, sessionRepo!, config, sessionId);
            currentPhaseIndex += 1;
            phaseActivatedAtMs = effectiveAt.getTime();
            log(config, 'PHASE_TRANSITION', {
              phaseIndex: currentPhaseIndex,
              effectivePollIntervalMs: next,
              effectivePhaseStartedAt: effectiveAt.toISOString(),
              completedPhase: completed,
              TRACKER_PHASE_START_EQUALS_EFFECTIVE_PHASE_START: 'YES',
            });
          } catch (transitionError) {
            orchestrationDegraded = true;
            await sessionService!.markExp021OrchestrationDegraded(
              config.organizationId,
              sessionId,
              transitionError instanceof Error ? transitionError.message : String(transitionError),
            );
            log(config, 'ORCHESTRATION_DEGRADED', {
              ORCHESTRATION_STATE: 'DEGRADED',
              RAW_RC_CONTINUES: 'YES',
              PHASE_TRANSITION_FAILED: 'YES',
              reason:
                transitionError instanceof Error ? transitionError.message : String(transitionError),
            });
          }
        }

        const endObservation = physicalEndDetector.observe(motion, motionState, nowMs);
        if (endObservation.candidateInvalidated && physicalDriveEndCandidateId) {
          await settlementShadow!.invalidatePhysicalDriveIntervalCandidate({
            sessionId,
            candidateId: physicalDriveEndCandidateId,
            reason: 'movement_resumed_after_end_candidate',
          });
          physicalDriveEndCandidateId = null;
        }

        if (endObservation.candidateConfirmed && physicalDriveEndCandidateId) {
          await settlementShadow!.confirmPhysicalDriveIntervalCandidate({
            sessionId,
            candidateId: physicalDriveEndCandidateId,
            reason: 'sustained_distinct_parked_evidence',
          });
        }

        if (
          endObservation.newProvisionalCandidate &&
          physicalDriveStartedAt &&
          sessionId
        ) {
          const candidate = endObservation.newProvisionalCandidate;
          physicalDriveEndCandidateId = candidate.candidateId;
          const scheduleCreatedAt = new Date(nowMs);
          await settlementShadow!.schedulePhysicalDriveIntervalShadow({
            sessionId,
            organizationId: config.organizationId,
            vehicleId: config.vehicleId,
            tokenId: config.tokenId,
            driveStartedAt: physicalDriveStartedAt,
            driveEndedAt: candidate.candidateBoundaryAt,
            candidateId: candidate.candidateId,
            candidateBoundaryAt: candidate.candidateBoundaryAt,
            candidateStatus: candidate.candidateStatus,
            scheduleCreatedAt,
          });
          physicalEndDetector.markSchedulesCreated(scheduleCreatedAt);
          log(config, 'PHYSICAL_DRIVE_END_CANDIDATE', {
            candidateId: candidate.candidateId,
            candidateBoundaryAt: candidate.candidateBoundaryAt.toISOString(),
            candidateDetectedAt: candidate.candidateDetectedAt.toISOString(),
            scheduleCreatedAt: scheduleCreatedAt.toISOString(),
            PDI_30_SCHEDULE_CREATED_BEFORE_DEADLINE:
              scheduleCreatedAt.getTime() <= candidate.candidateBoundaryAt.getTime() + 30_000
                ? 'YES'
                : 'NO',
          });
        }

        const lastPhaseIndex = config.cadencePhaseOrderMs.length - 1;
        const finalPhaseWallClockExpired =
          !physicalDriveEnded &&
          currentPhaseIndex === lastPhaseIndex &&
          phaseTracker.shouldAdvancePhase(nowMs);
        const hardPhysicalEndEligible = physicalEndDetector.hardPhysicalEndEligible(
          nowMs,
          motionState,
        );

        if (
          physicalDriveStarted &&
          (hardPhysicalEndEligible || finalPhaseWallClockExpired)
        ) {
          physicalDriveEnded = true;
          const stopReason = finalPhaseWallClockExpired
            ? 'FINAL_PHASE_WALL_CLOCK'
            : 'PHYSICAL_RUN_ENDED_EARLY';
          await completePhysicalRunAndStop({
            sessionService: sessionService!,
            settlementShadow: settlementShadow!,
            prisma: prisma!,
            config,
            sessionId,
            phaseTracker,
            physicalEndDetector,
            physicalDriveEndCandidateId,
            physicalDriveStartedAt,
            nowMs,
            reason: stopReason,
          });
          const final = await sessionRepo!.findById(config.organizationId, sessionId);
          const canonicalWholeTrip = await prisma!.referenceCaptureSettlementShadowSchedule.count({
            where: { sessionId, probeType: 'WHOLE_TRIP', phase: null },
          });
          const pdiSchedules = await prisma!.referenceCaptureSettlementShadowSchedule.count({
            where: { sessionId, phase: EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL },
          });
          log(config, 'AUTO_STOP_RECORDING', {
            physicalDriveEnded: true,
            STOP_REASON: stopReason,
            SESSION_STATUS: final?.status,
            CANONICAL_WHOLE_TRIP_COUNT: canonicalWholeTrip,
            PDI_COUNT: pdiSchedules,
            EXP021_RUN_COMPLETENESS: phaseTracker.computeRunCompleteness(
              config.cadencePhaseOrderMs.length,
            ),
            CALIBRATION_PLAN: config.calibrationPlan.planVersion,
            completedPhases: phaseTracker.getCompletedPhases(),
          });
          phase = 'DONE';
          running = false;
          break;
        }

        log(config, 'DRIVING_TICK', {
          speedKmh: motion.speedKmh,
          motionState,
          SPEED_PROVIDER_FIELD: motion.speedProviderField,
          SPEED_TIMESTAMP: motion.speedTimestamp,
          SPEED_AGE_MS: motion.speedAgeMs,
          currentPhaseIndex,
          phaseMs:
            currentPhaseIndex >= 0 ? config.cadencePhaseOrderMs[currentPhaseIndex] : null,
          endCandidateStatus: physicalEndDetector.getCandidate()?.candidateStatus ?? null,
        });
        await sleep(config.pollMs);
      }
      } catch (iterationError) {
        const err = iterationError instanceof Error ? iterationError : new Error(String(iterationError));
        const failureClass = classifyOrchestratorFailure(err);
        if (failureClass === 'integrity_fatal') {
          throw err;
        }
        if (failureClass === 'transient_provider') {
          log(config, 'TRANSIENT_PROVIDER_ERROR', {
            ORCHESTRATOR_REMAINS_ALIVE: 'YES',
            RAW_RC_CONTINUES: 'YES',
            error: err.message,
          });
          await sleep(config.pollMs);
          continue;
        }
        orchestrationDegraded = true;
        if (sessionId && sessionService) {
          await sessionService.markExp021OrchestrationDegraded(
            config.organizationId,
            sessionId,
            err.message,
          );
        }
        log(config, 'RECOVERABLE_ORCHESTRATION_ERROR', {
          ORCHESTRATION_STATE: 'DEGRADED',
          ORCHESTRATOR_REMAINS_ALIVE: 'YES',
          RAW_RC_CONTINUES: 'YES',
          error: err.message,
        });
        await sleep(config.pollMs);
      }
    }

    if (phase === 'DONE') {
      log(config, 'ORCHESTRATOR_COMPLETE', {
        sessionId,
        physicalDriveStarted,
        physicalDriveEnded,
        preRollStarted,
      });
    }
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error(String(error));
    throw fatalError;
  } finally {
    const cleanupSessionService = sessionService;
    const cleanupSessionRepo = sessionRepo;
    const cleanupSessionId = sessionId;
    const integrityFatal =
      fatalError != null && classifyOrchestratorFailure(fatalError) === 'integrity_fatal';
    if (integrityFatal && sessionStarted && cleanupSessionId && cleanupSessionService && cleanupSessionRepo) {
      const session = await cleanupSessionRepo.findById(config.organizationId, cleanupSessionId);
      if (session && (session.status === 'RECORDING' || session.status === 'STOPPING' || session.status === 'READY' || session.status === 'STARTING')) {
        const cleanup = await terminalizeSessionAfterFatal(
          config.organizationId,
          cleanupSessionId,
          cleanupSessionService,
          cleanupSessionRepo,
          fatalError
            ? `exp021_autonomous_fatal:${fatalError.message}`
            : 'exp021_autonomous_unexpected_exit',
        );
        log(config, 'FATAL_SESSION_CLEANUP', {
          FATAL_AFTER_RECORDING_TERMINALIZES_SESSION: 'YES',
          sessionId,
          ...cleanup,
          originalFatal: fatalError?.message ?? null,
        });
      }
    }

    const released = await releaseOrchestratorLock(redis, lockHandle);
    log(config, 'ORCHESTRATOR_LOCK_RELEASED', {
      lockKey,
      released,
      ORCHESTRATOR_LOCK_RELEASE_ALWAYS: 'YES',
    });
    await redis.quit();

    if (app) {
      await app.close();
    }
  }
}

main().catch((error) => {
  loadBackendEnvFile();
  const fatalConfig = buildExp021RuntimeConfig();
  log(fatalConfig, 'ORCHESTRATOR_FATAL', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
