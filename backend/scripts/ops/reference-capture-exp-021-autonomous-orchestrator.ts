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
import { ReferenceCaptureSettlementShadowService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.service';
import { EXP021_CADENCE_PHASE_ORDER_MS } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.policy';

const TARGET_SHA = (process.env.EXP021_TARGET_DEPLOY_SHA ?? '157b3c72226869e4e35d1a9398b78cab50d3fa54').toLowerCase();
const ORG = process.env.ORGANIZATION_ID ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = process.env.VEHICLE_ID ?? 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const TOKEN = Number.parseInt(process.env.TOKEN_ID ?? '187361', 10);
const PLATE = process.env.LICENSE_PLATE ?? 'KS MS 661';
const FRESH_THRESHOLD_SEC = Number.parseInt(process.env.FRESH_THRESHOLD_SEC ?? '600', 10);
const LOG_PATH =
  process.env.EXP021_AUTONOMOUS_LOG_PATH ??
  '/opt/synqdrive/shared/reference-evidence/exp-021-autonomous-orchestrator.jsonl';

const MOVEMENT_SPEED_KMH = Number.parseFloat(process.env.EXP021_MOVEMENT_SPEED_KMH ?? '8');
const MOVEMENT_SUSTAIN_SEC = Number.parseInt(process.env.EXP021_MOVEMENT_SUSTAIN_SEC ?? '45', 10);
const PARKED_SPEED_KMH = Number.parseFloat(process.env.EXP021_PARKED_SPEED_KMH ?? '3');
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

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

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

async function querySpeedKmh(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<{
  speedKmh: number | null;
  providerAgeSec: number | null;
  liveReady: boolean;
  latestProviderTimestamp: string | null;
}> {
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
  const signalsLatest = (latest.result?.data?.signalsLatest ?? {}) as Record<string, { timestamp?: string; value?: unknown }>;
  let latestProviderTimestamp: string | null = null;
  for (const entry of Object.values(signalsLatest)) {
    if (!entry?.timestamp) continue;
    if (!latestProviderTimestamp || entry.timestamp > latestProviderTimestamp) {
      latestProviderTimestamp = entry.timestamp;
    }
  }
  const providerAgeSec = latestProviderTimestamp
    ? Math.round((Date.now() - Date.parse(latestProviderTimestamp)) / 1000)
    : null;
  const liveReady = providerAgeSec != null && providerAgeSec <= FRESH_THRESHOLD_SEC;

  const speedEntry =
    signalsLatest.speed ??
    signalsLatest.currentSpeed ??
    signalsLatest['powertrainTransmissionCurrentGear'] ??
    null;
  let speedKmh: number | null = null;
  const raw = speedEntry?.value;
  if (typeof raw === 'number' && Number.isFinite(raw)) speedKmh = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) speedKmh = n;
  }

  return { speedKmh, providerAgeSec, liveReady, latestProviderTimestamp };
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

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-exp021-autonomous')) {
    throw new Error('Refusing without --confirm-exp021-autonomous');
  }
  loadEnv();
  log('ORCHESTRATOR_START', { TARGET_SHA, ORG, VEH, TOKEN, PLATE });

  let phase: Phase = 'WAIT_DEPLOY';
  let sessionId: string | null = null;
  let deployReady = false;
  let movementBeforeDeploy = false;
  let physicalDriveStarted = false;
  let physicalDriveEnded = false;
  let preRollStarted = false;
  let currentPhaseIndex = -1;
  let phaseActivatedAtMs: number | null = null;
  let movementSustainSince: number | null = null;
  let parkedSustainSince: number | null = null;

  type AppContext = Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let app: AppContext | null = null;
  let prisma: PrismaService | null = null;
  let sessionService: ReferenceCaptureSessionService | null = null;
  let sessionRepo: ReferenceCaptureSessionRepository | null = null;
  let settlementShadow: ReferenceCaptureSettlementShadowService | null = null;

  async function ensureApp(): Promise<void> {
    if (app) return;
    const appModule = await AppModule.forRootAsync();
    app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });
    prisma = app.get(PrismaService);
    sessionService = app.get(ReferenceCaptureSessionService);
    sessionRepo = app.get(ReferenceCaptureSessionRepository);
    settlementShadow = app.get(ReferenceCaptureSettlementShadowService);
  }

  try {
    while (true) {
      if (phase === 'DONE' || phase === 'SKIPPED') break;
      const sha = currentReleaseSha();
      const deployRunning = deployProcessRunning();
      const r3001 = replicaHealthy(3001);
      const r3002 = replicaHealthy(3002);
      const ext = externalHealthy();
      let motion: Awaited<ReturnType<typeof querySpeedKmh>> | null = null;
      if (deployReady) {
        await ensureApp();
        motion = await querySpeedKmh(app!);
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
        } else if (motion && motion.speedKmh != null && motion.speedKmh >= MOVEMENT_SPEED_KMH) {
          if (!movementSustainSince) movementSustainSince = Date.now();
          else if (Date.now() - movementSustainSince >= MOVEMENT_SUSTAIN_SEC * 1000) {
            movementBeforeDeploy = true;
          }
        } else {
          movementSustainSince = null;
        }

        if (movementBeforeDeploy && !deployReady) {
          phase = 'SKIPPED';
          log('EXP021_RUN_SKIPPED', {
            EXP021_RUN_SKIPPED_REASON: 'DEPLOY_NOT_READY_BEFORE_DRIVE_START',
          });
          break;
        }

        log('DEPLOY_WAIT', { deployRunning, sha, TARGET_SHA, r3001, r3002, ext, speedKmh: motion?.speedKmh ?? null });
        await sleep(POLL_MS);
        continue;
      }

      if (phase === 'PREP') {
        await ensureApp();
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
          sessionId = recording.id;
          preRollStarted = true;
          phase = 'WAIT_MOVEMENT';
          log('ATTACH_EXISTING_RECORDING', { sessionId });
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
        log('NEW_SESSION_READY', { sessionId, PREARM_READY: preflight.readiness?.deploymentPreflightReady });
        phase = 'WAIT_TELEMETRY';
        await sleep(POLL_MS);
        continue;
      }

      if (phase === 'WAIT_TELEMETRY') {
        if (!motion?.liveReady) {
          log('WAIT_TELEMETRY', { providerAgeSec: motion?.providerAgeSec ?? null, speedKmh: motion?.speedKmh ?? null });
          await sleep(POLL_MS);
          continue;
        }

        if (!sessionId) throw new Error('missing sessionId');
        const competing = await prisma!.referenceCaptureSession.count({
          where: { organizationId: ORG, status: 'RECORDING', id: { not: sessionId } },
        });
        if (competing > 0) throw new Error('competing RECORDING session exists');

        const parked = motion!.speedKmh == null || motion!.speedKmh < PARKED_SPEED_KMH;
        if (!parked) {
          log('WAIT_PARKED_FOR_PRE_ROLL', { speedKmh: motion!.speedKmh });
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
        const speed = motion.speedKmh;
        if (speed != null && speed >= MOVEMENT_SPEED_KMH) {
          if (!movementSustainSince) movementSustainSince = Date.now();
          else if (Date.now() - movementSustainSince >= MOVEMENT_SUSTAIN_SEC * 1000) {
            physicalDriveStarted = true;
            await sessionService!.switchHfCalibrationPhase(ORG, sessionId, { effectivePollIntervalMs: 60000 });
            await waitPhaseEffective(sessionRepo!, sessionId, 60000);
            await syncSettlement(settlementShadow!, sessionRepo!, sessionId);
            currentPhaseIndex = 0;
            phaseActivatedAtMs = Date.now();
            phase = 'DRIVING';
            log('PHYSICAL_DRIVE_START_DETECTED', {
              PHYSICAL_DRIVE_START_DETECTED: 'YES',
              PHASE_60_EFFECTIVE: 'YES',
              speedKmh: speed,
            });
            movementSustainSince = null;
          }
        } else {
          movementSustainSince = null;
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
        const speed = motion.speedKmh;

        if (phaseActivatedAtMs != null && currentPhaseIndex >= 0 && currentPhaseIndex < EXP021_CADENCE_PHASE_ORDER_MS.length - 1) {
          const elapsed = Date.now() - phaseActivatedAtMs;
          if (elapsed >= PHASE_DURATION_MS) {
            const next = EXP021_CADENCE_PHASE_ORDER_MS[currentPhaseIndex + 1];
            await sessionService!.switchHfCalibrationPhase(ORG, sessionId, { effectivePollIntervalMs: next });
            await waitPhaseEffective(sessionRepo!, sessionId, next);
            await syncSettlement(settlementShadow!, sessionRepo!, sessionId);
            currentPhaseIndex += 1;
            phaseActivatedAtMs = Date.now();
            log('PHASE_TRANSITION', { phaseIndex: currentPhaseIndex, effectivePollIntervalMs: next });
          }
        }

        if (physicalDriveStarted && (speed == null || speed < PARKED_SPEED_KMH)) {
          if (!parkedSustainSince) parkedSustainSince = Date.now();
          else if (Date.now() - parkedSustainSince >= DRIVE_END_PARKED_SEC * 1000) {
            physicalDriveEnded = true;
            await sessionService!.stopRecording(ORG, sessionId);
            const final = await sessionRepo!.findById(ORG, sessionId);
            const wholeTrip = await prisma!.referenceCaptureSettlementShadowSchedule.count({
              where: { sessionId, probeType: 'WHOLE_TRIP' },
            });
            log('AUTO_STOP_RECORDING', {
              physicalDriveEnded: true,
              SESSION_STATUS: final?.status,
              WHOLE_TRIP_SHADOW_SCHEDULED: wholeTrip,
            });
            phase = 'DONE';
            break;
          }
        } else {
          parkedSustainSince = null;
        }

        log('DRIVING_TICK', {
          speedKmh: speed,
          currentPhaseIndex,
          phaseMs: currentPhaseIndex >= 0 ? EXP021_CADENCE_PHASE_ORDER_MS[currentPhaseIndex] : null,
        });
        await sleep(POLL_MS);
      }
    }

    if (phase === 'DONE') {
      log('ORCHESTRATOR_COMPLETE', { sessionId, physicalDriveStarted, physicalDriveEnded, preRollStarted });
    }
  } finally {
    if (app) await app.close();
  }
}

main().catch((error) => {
  log('ORCHESTRATOR_FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
