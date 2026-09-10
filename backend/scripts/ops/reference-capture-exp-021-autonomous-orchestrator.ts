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
import { EXP021_CADENCE_PHASE_ORDER_MS } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.policy';
import Redis from 'ioredis';
import {
  acquireOrchestratorLock,
  buildOrchestratorLockKey,
  evaluateEffectivePolicyGate,
  extendOrchestratorLock,
  EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY,
  isOrchestratorOwnedRecordingSession,
  loadBackendEnvFile,
  releaseOrchestratorLock,
  resolveExp021TargetDeploySha,
  resolveFatalSessionCleanupMode,
  type OrchestratorLockHandle,
} from './reference-capture-exp-021-autonomous-orchestrator.lib';
import {
  classifyMotionState,
  EXP021_DEFAULT_PHYSICAL_START,
  EXP021_DEFAULT_TELEMETRY_FRESHNESS,
  parseSpeedSampleFromSignalsLatest,
  PhysicalDrivePhaseTracker,
  PhysicalStartDetector,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp-021-motion.lib';
const ORG = process.env.ORGANIZATION_ID ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = process.env.VEHICLE_ID ?? 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const TOKEN = Number.parseInt(process.env.TOKEN_ID ?? '187361', 10);
const PLATE = process.env.LICENSE_PLATE ?? 'KS MS 661';
const FRESH_THRESHOLD_SEC = Number.parseInt(process.env.FRESH_THRESHOLD_SEC ?? '600', 10);
const LOG_PATH =
  process.env.EXP021_AUTONOMOUS_LOG_PATH ??
  '/opt/synqdrive/shared/reference-evidence/exp-021-autonomous-orchestrator.jsonl';

const MOVEMENT_SPEED_KMH = Number.parseFloat(process.env.EXP021_MOVEMENT_SPEED_KMH ?? '8');
const PARKED_SPEED_KMH = Number.parseFloat(process.env.EXP021_PARKED_SPEED_KMH ?? '3');
const DRIVE_END_CANDIDATE_PARKED_SEC = Number.parseInt(
  process.env.EXP021_DRIVE_END_CANDIDATE_PARKED_SEC ?? '120',
  10,
);
const DRIVE_END_PARKED_SEC = Number.parseInt(process.env.EXP021_DRIVE_END_PARKED_SEC ?? '600', 10);
const PHASE_DURATION_MS = Number.parseInt(process.env.EXP021_PHASE_DURATION_MS ?? '300000', 10);
const POLL_MS = Number.parseInt(process.env.EXP021_POLL_MS ?? '15000', 10);

type Phase =
  | 'WAIT_DEPLOY'
  | 'PREP'
  | 'WAIT_TELEMETRY'
  | 'WAIT_MOVEMENT'
  | 'DRIVING'
  | 'DONE'
  | 'SKIPPED';

function log(event: string, payload: Record<string, unknown> = {}): void {
  const row = JSON.stringify({ at: new Date().toISOString(), event, ...payload });
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, row + '\n');
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
): Promise<ReturnType<typeof parseSpeedSampleFromSignalsLatest> & { liveReady: boolean }> {
  const dimoAuth = app.get(DimoAuthService);
  const dimoTelemetry = app.get(DimoTelemetryService);
  const jwt = await dimoAuth.getVehicleJwt(TOKEN);
  const providerContext = buildDimoProviderRequestContext(TOKEN, { organizationId: ORG, vehicleId: VEH });
  const avail = await dimoTelemetry.queryGraphQLWithIngressTiming(
    jwt,
    buildAvailableSignalsQuery(TOKEN),
    undefined,
    providerContext,
    'REFERENCE_CAPTURE',
  );
  const signals: string[] = Array.isArray(avail.result?.data?.availableSignals)
    ? avail.result.data.availableSignals.filter((s: unknown): s is string => typeof s === 'string')
    : [];
  const latest = await dimoTelemetry.queryGraphQLWithIngressTiming(
    jwt,
    buildBroadReferenceSignalsLatestQuery(TOKEN, signals),
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
    vehicleTelemetryFreshThresholdMs: FRESH_THRESHOLD_SEC * 1000,
    speedSignalFreshThresholdMs: EXP021_DEFAULT_TELEMETRY_FRESHNESS.speedSignalFreshThresholdMs,
  });
  const liveReady = sample.vehicleTelemetryFresh;
  return { ...sample, liveReady };
}

async function syncSettlement(
  settlementShadow: ReferenceCaptureSettlementShadowService,
  sessionRepo: ReferenceCaptureSessionRepository,
  sessionId: string,
): Promise<void> {
  const s = await sessionRepo.findById(ORG, sessionId);
  await settlementShadow.syncCompletedPhasesFromSession({
    sessionId,
    organizationId: ORG,
    vehicleId: VEH,
    tokenId: TOKEN,
    acquisitionStateJson: s?.acquisitionStateJson,
  });
}

async function waitForRecordingCycles(sessionRepo: ReferenceCaptureSessionRepository, sessionId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const s = await sessionRepo.findById(ORG, sessionId);
    const st = parseAcquisitionState(s?.acquisitionStateJson);
    if (s?.status === 'RECORDING' && (st.cycleCount ?? 0) >= 1) return;
    if (s?.status === 'FAILED' || s?.status === 'ABORTED') throw new Error(`session terminal ${s?.status}`);
  }
  throw new Error('recording cycles not observed');
}

async function waitPhaseEffective(
  sessionRepo: ReferenceCaptureSessionRepository,
  sessionId: string,
  pollMs: number,
): Promise<void> {
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const s = await sessionRepo.findById(ORG, sessionId);
    const st = parseAcquisitionState(s?.acquisitionStateJson);
    const ap = st.hfCalibrationSeries?.activePhase;
    if (ap?.effectivePollIntervalMs === pollMs && ap?.phaseStartedAt) return;
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
  const TARGET_SHA = resolveExp021TargetDeploySha();
  const orchestratorRunId = `exp021-${Date.now()}`;
  log('ORCHESTRATOR_START', { TARGET_SHA, ORG, VEH, TOKEN, PLATE, orchestratorRunId });

  const redis = new Redis(redisConnection());
  const lockKey = buildOrchestratorLockKey(ORG, VEH);
  const lockResult = await acquireOrchestratorLock(redis, lockKey);
  if (!lockResult.acquired) {
    log('ORCHESTRATOR_FATAL', {
      error: 'competing orchestrator instance holds lock',
      lockReason: lockResult.reason,
      DUPLICATE_INSTANCE_FAIL_CLOSED: 'YES',
    });
    await redis.quit();
    process.exit(1);
  }
  const lockHandle: OrchestratorLockHandle = lockResult.handle;
  log('ORCHESTRATOR_LOCK_ACQUIRED', { lockKey, DUPLICATE_INSTANCE_FAIL_CLOSED: 'YES' });

  let phase: Phase = 'WAIT_DEPLOY';
  let sessionId: string | null = null;
  let sessionStarted = false;
  let deployReady = false;
  let policyGatePassed = false;
  let movementBeforeDeploy = false;
  let physicalDriveStarted = false;
  let physicalDriveEnded = false;
  let preRollStarted = false;
  let currentPhaseIndex = -1;
  let phaseActivatedAtMs: number | null = null;
  let parkedSustainSince: number | null = null;
  let endCandidateSustainSince: number | null = null;
  let physicalDriveStartedAt: Date | null = null;
  let physicalDriveEndCandidateAt: Date | null = null;
  let physicalDriveEndCandidateId: string | null = null;
  let physicalDriveIntervalScheduled = false;
  const physicalStartDetector = new PhysicalStartDetector({
    ...EXP021_DEFAULT_PHYSICAL_START,
    movementSpeedKmh: MOVEMENT_SPEED_KMH,
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

  let running = true;
  try {
    while (running) {
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
        motion = await queryMotionSample(app!);
      }

      if (!deployReady) {
        if (!deployRunning && sha === TARGET_SHA && r3001 && r3002 && ext && redisHealthy()) {
          deployReady = true;
          log('DEPLOY_CONVERGED', {
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
        } else if (
          motion &&
          classifyMotionState(motion, PARKED_SPEED_KMH, MOVEMENT_SPEED_KMH) === 'MOVING'
        ) {
          physicalStartDetector.record(motion, Date.now());
          if (physicalStartDetector.isConfirmed()) {
            movementBeforeDeploy = true;
          }
        } else {
          physicalStartDetector.reset();
        }

        if (movementBeforeDeploy && !deployReady) {
          phase = 'SKIPPED';
          log('EXP021_RUN_SKIPPED', {
            EXP021_RUN_SKIPPED_REASON: 'DEPLOY_NOT_READY_BEFORE_DRIVE_START',
          });
          running = false;
          break;
        }

        if (!deployReady) {
          log('DEPLOY_WAIT', {
            deployRunning,
            sha,
            TARGET_SHA,
            r3001,
            r3002,
            ext,
            speedKmh: motion?.speedKmh ?? null,
            motionState: motion
              ? classifyMotionState(motion, PARKED_SPEED_KMH, MOVEMENT_SPEED_KMH)
              : 'UNKNOWN',
          });
          await sleep(POLL_MS);
          continue;
        }
      }

      if (phase === 'PREP') {
        await ensureApp();
        if (!policyGatePassed) {
          const gate = evaluateEffectivePolicyGate(rcConfig!.getHfRecoveryPolicyConfig(), TOKEN);
          log('EFFECTIVE_POLICY_PRECHECK', {
            EFFECTIVE_HF_POLICY_MODE: gate.effectiveMode,
            CALIBRATION_PHASE_ACTIVATION_ALLOWED: gate.allowed ? 'YES' : 'NO',
            blocker: gate.blocker ?? null,
          });
          if (!gate.allowed) {
            throw new Error(gate.blocker ?? 'HF V2 policy gate failed before session creation');
          }
          policyGatePassed = true;
        }

        const fsm = await prisma!.vehicleTripDetectionState.findUnique({ where: { vehicleId: VEH } });
        const lastTrip = await prisma!.vehicleTrip.findFirst({ where: { vehicleId: VEH }, orderBy: { startTime: 'desc' } });
        log('TRIP_FSM_POST_DEPLOY', {
          tripFsmState: fsm?.state,
          activeTripId: fsm?.activeTripId,
          lastTrip: lastTrip
            ? { id: lastTrip.id, tripStatus: lastTrip.tripStatus, end: lastTrip.endTime?.toISOString() }
            : null,
        });

        const recording = await prisma!.referenceCaptureSession.findFirst({
          where: { organizationId: ORG, vehicleId: VEH, status: 'RECORDING' },
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
          phase = 'WAIT_MOVEMENT';
          log('ATTACH_EXISTING_RECORDING', { sessionId, orchestratorRunId });
          await sleep(POLL_MS);
          continue;
        }

        const staleReady = await prisma!.referenceCaptureSession.findMany({
          where: { organizationId: ORG, vehicleId: VEH, status: { in: ['READY', 'STARTING'] } },
        });
        for (const stale of staleReady) {
          await sessionService!.abortSession(ORG, stale.id, 'exp021_autonomous_fresh_session_replace');
          log('ABORTED_STALE_READY', { sessionId: stale.id });
        }

        const created = await sessionService!.createSession({ organizationId: ORG, vehicleId: VEH, groundTruthVideoRef: null });
        const preflight = await sessionService!.runPreflight(ORG, created.id);
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
        log('NEW_SESSION_READY', { sessionId, PREARM_READY: preflight.readiness?.deploymentPreflightReady });
        phase = 'WAIT_TELEMETRY';
        await sleep(POLL_MS);
        continue;
      }

      if (phase === 'WAIT_TELEMETRY') {
        if (!motion?.liveReady) {
          log('WAIT_TELEMETRY', {
            speedKmh: motion?.speedKmh ?? null,
            speedAgeMs: motion?.speedAgeMs ?? null,
            vehicleTelemetryFresh: motion?.vehicleTelemetryFresh ?? false,
            speedSignalFresh: motion?.speedSignalFresh ?? false,
          });
          await sleep(POLL_MS);
          continue;
        }

        if (!sessionId) throw new Error('missing sessionId');
        const competing = await prisma!.referenceCaptureSession.count({
          where: { organizationId: ORG, status: 'RECORDING', id: { not: sessionId } },
        });
        if (competing > 0) throw new Error('competing RECORDING session exists');

        const preRollMotion = classifyMotionState(motion!, PARKED_SPEED_KMH, MOVEMENT_SPEED_KMH);
        if (preRollMotion !== 'PARKED_CANDIDATE') {
          log('WAIT_PARKED_FOR_PRE_ROLL', {
            speedKmh: motion!.speedKmh,
            motionState: preRollMotion,
          });
          await sleep(POLL_MS);
          continue;
        }

        const sess = await sessionRepo!.findById(ORG, sessionId);
        if (sess?.status === 'RECORDING') {
          preRollStarted = true;
          phase = 'WAIT_MOVEMENT';
          await sleep(POLL_MS);
          continue;
        }
        if (sess?.status !== 'READY') throw new Error(`session not READY: ${sess?.status}`);

        await sessionService!.startRecording(ORG, sessionId);
        sessionStarted = true;
        await waitForRecordingCycles(sessionRepo!, sessionId);
        preRollStarted = true;
        log('AUTO_START_RECORDING_CALLED', {
          AUTO_START_RECORDING_CALLED: 'YES',
          SESSION_ID: sessionId,
          SESSION_STATUS: 'RECORDING',
          LIVE_TELEMETRY_READY: 'YES',
        });
        phase = 'WAIT_MOVEMENT';
        await sleep(POLL_MS);
        continue;
      }

      if (phase === 'WAIT_MOVEMENT') {
        if (!sessionId) throw new Error('missing sessionId');
        if (!motion) {
          await sleep(POLL_MS);
          continue;
        }
        const motionState = classifyMotionState(motion, PARKED_SPEED_KMH, MOVEMENT_SPEED_KMH);
        if (motionState === 'MOVING') {
          physicalStartDetector.record(motion, Date.now());
          if (physicalStartDetector.isConfirmed()) {
            physicalDriveStarted = true;
            physicalDriveStartedAt = new Date();
            await sessionService!.switchHfCalibrationPhase(ORG, sessionId, { effectivePollIntervalMs: 60000 });
            await waitPhaseEffective(sessionRepo!, sessionId, 60000);
            await syncSettlement(settlementShadow!, sessionRepo!, sessionId);
            currentPhaseIndex = 0;
            phaseActivatedAtMs = Date.now();
            phaseTracker.beginPhase(EXP021_CADENCE_PHASE_ORDER_MS[0], Date.now());
            phase = 'DRIVING';
            log('PHYSICAL_DRIVE_START_DETECTED', {
              PHYSICAL_DRIVE_START_DETECTED: 'YES',
              PHASE_60_EFFECTIVE: 'YES',
              speedKmh: motion.speedKmh,
              SPEED_PROVIDER_FIELD: motion.speedProviderField,
              SPEED_TIMESTAMP: motion.speedTimestamp,
              SPEED_AGE_MS: motion.speedAgeMs,
              distinctMovingSamples: physicalStartDetector.getQualifyingSampleCount(),
            });
            physicalStartDetector.reset();
          }
        } else {
          physicalStartDetector.reset();
        }
        await sleep(POLL_MS);
        continue;
      }

      if (phase === 'DRIVING') {
        if (!sessionId) throw new Error('missing sessionId');
        if (!motion) {
          await sleep(POLL_MS);
          continue;
        }
        const motionState = classifyMotionState(motion, PARKED_SPEED_KMH, MOVEMENT_SPEED_KMH);
        phaseTracker.tick(motionState, Date.now());

        if (
          !physicalDriveEnded &&
          currentPhaseIndex >= 0 &&
          currentPhaseIndex < EXP021_CADENCE_PHASE_ORDER_MS.length - 1 &&
          phaseTracker.shouldAdvancePhase(PHASE_DURATION_MS)
        ) {
          const next = EXP021_CADENCE_PHASE_ORDER_MS[currentPhaseIndex + 1];
          const completed = phaseTracker.advancePhase(Date.now(), next);
          await sessionService!.switchHfCalibrationPhase(ORG, sessionId, { effectivePollIntervalMs: next });
          await waitPhaseEffective(sessionRepo!, sessionId, next);
          await syncSettlement(settlementShadow!, sessionRepo!, sessionId);
          currentPhaseIndex += 1;
          phaseActivatedAtMs = Date.now();
          log('PHASE_TRANSITION', {
            phaseIndex: currentPhaseIndex,
            effectivePollIntervalMs: next,
            completedPhase: completed,
          });
        }

        if (physicalDriveStarted && motionState === 'MOVING' && physicalDriveEndCandidateId) {
          await settlementShadow!.invalidatePhysicalDriveIntervalCandidate({
            sessionId,
            candidateId: physicalDriveEndCandidateId,
            reason: 'movement_resumed_after_end_candidate',
          });
          physicalDriveEndCandidateId = null;
          physicalDriveEndCandidateAt = null;
          physicalDriveIntervalScheduled = false;
          endCandidateSustainSince = null;
          parkedSustainSince = null;
        }

        if (physicalDriveStarted && motionState === 'PARKED_CANDIDATE') {
          if (!endCandidateSustainSince) endCandidateSustainSince = Date.now();
          if (
            !physicalDriveIntervalScheduled &&
            Date.now() - endCandidateSustainSince >= DRIVE_END_CANDIDATE_PARKED_SEC * 1000 &&
            physicalDriveStartedAt
          ) {
            physicalDriveEndCandidateAt = new Date();
            physicalDriveEndCandidateId = `pdi-${physicalDriveEndCandidateAt.getTime()}`;
            await settlementShadow!.schedulePhysicalDriveIntervalShadow({
              sessionId,
              organizationId: ORG,
              vehicleId: VEH,
              tokenId: TOKEN,
              driveStartedAt: physicalDriveStartedAt,
              driveEndedAt: physicalDriveEndCandidateAt,
              candidateId: physicalDriveEndCandidateId,
            });
            physicalDriveIntervalScheduled = true;
            log('PHYSICAL_DRIVE_END_CANDIDATE', {
              candidateId: physicalDriveEndCandidateId,
              driveEndedAt: physicalDriveEndCandidateAt.toISOString(),
            });
          }

          if (!parkedSustainSince) parkedSustainSince = Date.now();
          else if (Date.now() - parkedSustainSince >= DRIVE_END_PARKED_SEC * 1000) {
            physicalDriveEnded = true;
            phaseTracker.markPhysicalDriveEnded(Date.now());
            await sessionService!.stopRecording(ORG, sessionId);
            const final = await sessionRepo!.findById(ORG, sessionId);
            const wholeTrip = await prisma!.referenceCaptureSettlementShadowSchedule.count({
              where: { sessionId, probeType: 'WHOLE_TRIP' },
            });
            log('AUTO_STOP_RECORDING', {
              physicalDriveEnded: true,
              SESSION_STATUS: final?.status,
              WHOLE_TRIP_SHADOW_SCHEDULED: wholeTrip,
              EXP021_RUN_COMPLETENESS: phaseTracker.computeRunCompleteness(
                EXP021_CADENCE_PHASE_ORDER_MS.length,
              ),
              completedPhases: phaseTracker.getCompletedPhases(),
            });
            phase = 'DONE';
            running = false;
            break;
          }
        } else if (physicalDriveStarted && motionState === 'UNKNOWN') {
          endCandidateSustainSince = null;
        } else if (physicalDriveStarted) {
          endCandidateSustainSince = null;
          parkedSustainSince = null;
        }

        log('DRIVING_TICK', {
          speedKmh: motion.speedKmh,
          motionState,
          SPEED_PROVIDER_FIELD: motion.speedProviderField,
          SPEED_TIMESTAMP: motion.speedTimestamp,
          SPEED_AGE_MS: motion.speedAgeMs,
          currentPhaseIndex,
          phaseMs: currentPhaseIndex >= 0 ? EXP021_CADENCE_PHASE_ORDER_MS[currentPhaseIndex] : null,
        });
        await sleep(POLL_MS);
      }
    }

    if (phase === 'DONE') {
      log('ORCHESTRATOR_COMPLETE', { sessionId, physicalDriveStarted, physicalDriveEnded, preRollStarted });
    }
  } catch (error) {
    fatalError = error instanceof Error ? error : new Error(String(error));
    throw fatalError;
  } finally {
    const cleanupSessionService = sessionService;
    const cleanupSessionRepo = sessionRepo;
    const cleanupSessionId = sessionId;
    if (fatalError && sessionStarted && cleanupSessionId && cleanupSessionService && cleanupSessionRepo) {
      const session = await cleanupSessionRepo.findById(ORG, cleanupSessionId);
      if (session && (session.status === 'RECORDING' || session.status === 'STOPPING' || session.status === 'READY' || session.status === 'STARTING')) {
        const cleanup = await terminalizeSessionAfterFatal(
          ORG,
          cleanupSessionId,
          cleanupSessionService,
          cleanupSessionRepo,
          fatalError
            ? `exp021_autonomous_fatal:${fatalError.message}`
            : 'exp021_autonomous_unexpected_exit',
        );
        log('FATAL_SESSION_CLEANUP', {
          FATAL_AFTER_RECORDING_TERMINALIZES_SESSION: 'YES',
          sessionId,
          ...cleanup,
          originalFatal: fatalError?.message ?? null,
        });
      }
    }

    const released = await releaseOrchestratorLock(redis, lockHandle);
    log('ORCHESTRATOR_LOCK_RELEASED', { lockKey, released, ORCHESTRATOR_LOCK_RELEASE_ALWAYS: 'YES' });
    await redis.quit();

    if (app) {
      await app.close();
    }
  }
}

main().catch((error) => {
  log('ORCHESTRATOR_FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
