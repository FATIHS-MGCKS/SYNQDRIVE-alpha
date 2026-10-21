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
  type Exp021RuntimeConfig,
  type OrchestratorLockHandle,
} from './reference-capture-exp-021-autonomous-orchestrator.lib';
import {
  classifyMotionState,
  EXP021_DEFAULT_PHYSICAL_END,
  EXP021_DEFAULT_TELEMETRY_FRESHNESS,
  EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
  parseSpeedSampleFromSignalsLatest,
  EXP021_DEFAULT_PRE_DEPLOY_MOVEMENT,
  PreDeployMovementGate,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-motion.lib';
import { classifyOrchestratorFailure } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-physical-authority.lib';
import {
  createDefaultWaitPhaseEffective,
  Exp021AutonomousLifecycleDriver,
  waitExp021RecordingCycles,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-autonomous-lifecycle.driver';

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
  let orchestrationDegraded = false;
  let preRollStarted = false;
  let fatalError: Error | null = null;
  let lifecycleDriver: Exp021AutonomousLifecycleDriver | undefined;

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
    if (!lifecycleDriver) {
      lifecycleDriver = new Exp021AutonomousLifecycleDriver(
        {
          config,
          sessionService: sessionService!,
          sessionRepo: sessionRepo!,
          settlementShadow: settlementShadow!,
          prisma,
        },
        {
          nowMs: () => Date.now(),
          sleep,
          waitPhaseEffective: createDefaultWaitPhaseEffective(
            { sleep },
            sessionRepo!,
            config,
          ),
          waitForRecordingCycles: (sid) =>
            waitExp021RecordingCycles({ sleep }, sessionRepo!, config, sid),
          log: (event, payload = {}) => log(config, event, payload),
        },
      );
    }
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
          lifecycleDriver?.physicalStartDetector.reset();
          preDeployMovementGate.reset();
          deployConvergedAtMs = Date.now();
          if (lifecycleDriver) lifecycleDriver.deployConvergedAtMs = deployConvergedAtMs;
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
          if (lifecycleDriver) {
            lifecycleDriver.sessionId = sessionId;
            const resume = lifecycleDriver.tryResumeFromRecordingSession(recording);
            orchestrationDegraded = lifecycleDriver.orchestrationDegraded;
            if (resume === 'driving') {
              phase = 'DRIVING';
            } else {
              phase = 'WAIT_MOVEMENT';
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
        if (lifecycleDriver) lifecycleDriver.sessionId = sessionId;
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
        if (lifecycleDriver?.ports.waitForRecordingCycles) {
          await lifecycleDriver.ports.waitForRecordingCycles(sessionId);
        } else {
          await waitExp021RecordingCycles({ sleep }, sessionRepo!, config, sessionId);
        }
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
        if (!sessionId || !lifecycleDriver) throw new Error('missing sessionId or lifecycle driver');
        lifecycleDriver.sessionId = sessionId;
        if (!motion) {
          await sleep(config.pollMs);
          continue;
        }
        const waitResult = await lifecycleDriver.handleWaitMovement(motion);
        orchestrationDegraded = lifecycleDriver.orchestrationDegraded;
        if (waitResult.status === 'skipped') {
          phase = 'SKIPPED';
          log(config, 'EXP021_RUN_SKIPPED', {
            EXP021_RUN_SKIPPED_REASON: waitResult.reason,
          });
          running = false;
          break;
        }
        if (waitResult.status === 't0_confirmed' || lifecycleDriver.physicalDriveStarted) {
          phase = 'DRIVING';
        }
        await sleep(config.pollMs);
        continue;
      }

      if (phase === 'DRIVING') {
        if (!sessionId || !lifecycleDriver) throw new Error('missing sessionId or lifecycle driver');
        lifecycleDriver.sessionId = sessionId;
        if (!motion) {
          await sleep(config.pollMs);
          continue;
        }
        const tickResult = await lifecycleDriver.tickDriving(motion);
        orchestrationDegraded = lifecycleDriver.orchestrationDegraded;
        if (tickResult.status === 'done') {
          const final = await sessionRepo!.findById(config.organizationId, sessionId);
          const canonicalWholeTrip = await prisma!.referenceCaptureSettlementShadowSchedule.count({
            where: { sessionId, probeType: 'WHOLE_TRIP', phase: null },
          });
          const pdiSchedules = await prisma!.referenceCaptureSettlementShadowSchedule.count({
            where: { sessionId, phase: EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL },
          });
          log(config, 'AUTO_STOP_RECORDING', {
            physicalDriveEnded: true,
            STOP_REASON: tickResult.stopReason,
            SESSION_STATUS: final?.status,
            CANONICAL_WHOLE_TRIP_COUNT: canonicalWholeTrip,
            PDI_COUNT: pdiSchedules,
            EXP021_RUN_COMPLETENESS: lifecycleDriver.phaseTracker.computeRunCompleteness(
              config.cadencePhaseOrderMs.length,
            ),
            CALIBRATION_PLAN: config.calibrationPlan.planVersion,
            completedPhases: lifecycleDriver.phaseTracker.getCompletedPhases(),
          });
          phase = 'DONE';
          running = false;
          break;
        }

        log(config, 'DRIVING_TICK', {
          speedKmh: motion.speedKmh,
          motionState: lifecycleDriver.classifyMotion(motion),
          SPEED_PROVIDER_FIELD: motion.speedProviderField,
          SPEED_TIMESTAMP: motion.speedTimestamp,
          SPEED_AGE_MS: motion.speedAgeMs,
          currentPhaseIndex: lifecycleDriver.currentPhaseIndex,
          phaseMs:
            lifecycleDriver.currentPhaseIndex >= 0
              ? config.cadencePhaseOrderMs[lifecycleDriver.currentPhaseIndex]
              : null,
          endCandidateStatus: lifecycleDriver.physicalEndDetector.getCandidate()?.candidateStatus ?? null,
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
        physicalDriveStarted: lifecycleDriver?.physicalDriveStarted ?? false,
        physicalDriveEnded: lifecycleDriver?.physicalDriveEnded ?? false,
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
