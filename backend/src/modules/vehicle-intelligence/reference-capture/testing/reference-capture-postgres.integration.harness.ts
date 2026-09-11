import { randomUUID } from 'crypto';
import { Prisma, PrismaClient, type ReferenceCaptureSession } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ReferenceCaptureSessionRepository,
  parseAcquisitionState,
} from '../reference-capture-session.repository';
import type { ReferenceCaptureAcquisitionState } from '../reference-capture.types';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  type HfRecoveryPolicyV2Config,
} from '../reference-capture-hf-recovery-v2.policy';
import { HF_PHYSICAL_IDENTITY_VERSION } from '../reference-capture-physical-sample-identity.util';
import {
  accumulatePhaseQueryMetrics,
  switchHfCalibrationPhase,
  type HfCalibrationPhaseRuntimeCounters,
} from '../reference-capture-hf-calibration-phase.policy';

export const RC_POSTGRES_HOST = process.env.TEST_POSTGRES_HOST ?? '127.0.0.1';
export const RC_POSTGRES_PORT = Number.parseInt(process.env.TEST_POSTGRES_PORT ?? '5432', 10);
export const RC_POSTGRES_DATABASE =
  process.env.TEST_POSTGRES_DATABASE ?? 'synqdrive_rc_def019_test';

export function buildReferenceCapturePostgresDatabaseUrl(): string {
  const user = process.env.RC_DEF019_POSTGRES_USER ?? 'rc_def019_test';
  const password = process.env.RC_DEF019_POSTGRES_PASSWORD ?? 'RcDef019Test_9xK2m';
  return `postgresql://${user}:${password}@${RC_POSTGRES_HOST}:${RC_POSTGRES_PORT}/${RC_POSTGRES_DATABASE}?schema=public`;
}

function extractPostgresDatabaseName(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    const pathDb = parsed.pathname.replace(/^\//, '').split('/')[0];
    return decodeURIComponent(pathDb ?? '').toLowerCase();
  } catch {
    const match = databaseUrl.match(/\/([^/?]+)(?:\?|$)/);
    return (match?.[1] ?? '').toLowerCase();
  }
}

export function proveIsolatedReferenceCapturePostgres(): {
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
} {
  const databaseUrl = process.env.DATABASE_URL ?? buildReferenceCapturePostgresDatabaseUrl();
  const blockedHosts = ['srv1374778', 'app.synqdrive.eu', 'mein-vps', 'hstgr.cloud'];
  const blockedDbNames = ['synqdrive_prod', 'synqdrive_production', 'synqdrive'];
  const lowerUrl = databaseUrl.toLowerCase();
  const actualDb = extractPostgresDatabaseName(databaseUrl);

  for (const host of blockedHosts) {
    if (lowerUrl.includes(host)) {
      throw new Error(`Refusing non-isolated DATABASE_URL host match: ${host}`);
    }
  }
  for (const dbName of blockedDbNames) {
    if (actualDb === dbName.toLowerCase()) {
      throw new Error(`Refusing non-isolated DATABASE_URL database: ${dbName}`);
    }
  }

  const expectedDb = RC_POSTGRES_DATABASE.toLowerCase();
  if (actualDb !== expectedDb) {
    throw new Error(`DATABASE_URL must target ${RC_POSTGRES_DATABASE}`);
  }

  return {
    postgresHost: RC_POSTGRES_HOST,
    postgresPort: RC_POSTGRES_PORT,
    postgresDatabase: RC_POSTGRES_DATABASE,
  };
}

export async function probeReferenceCapturePostgresDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'reference_capture_sessions'
      ) AS exists
    `;
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export function createRepository(prisma: PrismaClient): ReferenceCaptureSessionRepository {
  return new ReferenceCaptureSessionRepository(prisma as PrismaService);
}

export function defaultV2Policy(): HfRecoveryPolicyV2Config {
  return parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '30000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
    HF_SETTLEMENT_DELAY_MS: '8000',
    HF_RECOVERY_OVERLAP_MS: '6000',
  });
}

export function emptyDataPlane(nowMs: number): ReferenceCaptureAcquisitionState {
  const iso = new Date(nowMs).toISOString();
  return {
    cycleCount: 1,
    lastCycleAt: iso,
    hfWatermarkAt: iso,
    hfWatermarkByField: { speed: iso },
    hfQueryCoverageByField: { speed: iso },
    hfPhysicalIdentityVersion: HF_PHYSICAL_IDENTITY_VERSION.AGGREGATE_BUCKET_V2,
    hfQueryProvenanceRing: [],
    hfRecoveryCursorByField: {},
    lastRecoverySweepAt: null,
    recoverySweepCount: 0,
    lastHfHistoricalPollAt: iso,
    eventWatermarkAt: null,
    seenEventFingerprints: [],
    seenPhysicalSampleFingerprints: [],
    lastSequenceNumber: 1,
    quarantinedProviderFields: [],
    consecutiveTransientFailures: 0,
    lastFailureClass: null,
    lastFailureAt: null,
    hfCalibrationSeries: null,
    hfCalibrationActiveCounters: null,
    acquisitionStateVersion: 0,
    activeCycleJobId: null,
  };
}

export interface ReferenceCaptureSeed {
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  tokenId: number;
}

export async function seedRecordingSession(
  prisma: PrismaClient,
  suffix: string,
  options?: { tokenId?: number; acquisitionState?: ReferenceCaptureAcquisitionState },
): Promise<ReferenceCaptureSeed> {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  const tokenId = options?.tokenId ?? 187_336;
  const acquisitionState = options?.acquisitionState ?? emptyDataPlane(Date.now());
  const vin = `RC${suffix.replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);

  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${`RC DEF019 Test Org ${suffix}`}, 'FLEET', NOW(), NOW())
  `;

  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at
    )
    VALUES (
      ${vehicleId},
      ${organizationId},
      ${vin},
      'Test',
      'RC',
      2024,
      'ELECTRIC',
      'AVAILABLE',
      'CLEAN',
      'GOOD',
      NOW(),
      NOW()
    )
  `;

  await prisma.$executeRaw`
    INSERT INTO reference_capture_sessions (
      id,
      organization_id,
      vehicle_id,
      connection_profile,
      manifest_id,
      manifest_version,
      recorder_software_version,
      status,
      started_at,
      acquisition_state_json,
      created_at,
      updated_at
    )
    VALUES (
      ${sessionId},
      ${organizationId},
      ${vehicleId},
      'DIMO',
      ${`manifest-${suffix}`},
      '1.0.0',
      'test',
      'RECORDING',
      NOW(),
      ${JSON.stringify(acquisitionState)}::jsonb,
      NOW(),
      NOW()
    )
  `;

  return { organizationId, vehicleId, sessionId, tokenId };
}

export async function cleanupReferenceCaptureSeed(
  prisma: PrismaClient,
  seed: Pick<ReferenceCaptureSeed, 'organizationId' | 'vehicleId' | 'sessionId'>,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM reference_capture_settlement_shadow_observations WHERE session_id = ${seed.sessionId}
  `;
  await prisma.$executeRaw`
    DELETE FROM reference_capture_settlement_shadow_schedules WHERE session_id = ${seed.sessionId}
  `;
  await prisma.$executeRaw`
    DELETE FROM reference_capture_settlement_shadow_experiments WHERE session_id = ${seed.sessionId}
  `;
  await prisma.$executeRaw`
    DELETE FROM reference_capture_observations WHERE session_id = ${seed.sessionId}
  `;
  await prisma.$executeRaw`
    DELETE FROM reference_capture_sessions WHERE id = ${seed.sessionId}
  `;
  await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${seed.vehicleId}`;
  await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${seed.organizationId}`;
}

export async function activatePendingPhaseAtBoundary(
  repo: ReferenceCaptureSessionRepository,
  organizationId: string,
  sessionId: string,
  hfPolicy: HfRecoveryPolicyV2Config,
  effectiveAtMs: number,
): Promise<ReferenceCaptureSession> {
  const cycleJobId = `cycle-${randomUUID()}`;
  const acquired = await repo.tryAcquireCycleLock(organizationId, sessionId, cycleJobId);
  if (!acquired.acquired) {
    throw new Error(`Failed to acquire cycle lock for session ${sessionId}`);
  }

  const session = await repo.findById(organizationId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const current = parseAcquisitionState(session.acquisitionStateJson);
  const {
    hfCalibrationSeries: _series,
    hfCalibrationActiveCounters: _counters,
    acquisitionStateVersion: _version,
    activeCycleJobId: _lock,
    ...dataPlaneScalars
  } = current;

  const released = await repo.releaseCycleLockAndUpdateState(
    organizationId,
    sessionId,
    cycleJobId,
    {
      dataPlane: {
        ...dataPlaneScalars,
        hfCalibrationActiveCounters: null,
      },
      hfPolicy,
      effectiveAtMs,
    },
  );
  if (!released) {
    throw new Error(`Cycle release failed for session ${sessionId}`);
  }

  const updated = await repo.findById(organizationId, sessionId);
  if (!updated) throw new Error(`Session ${sessionId} missing after cycle release`);
  return updated;
}

export async function requestAndActivatePhase(
  repo: ReferenceCaptureSessionRepository,
  seed: ReferenceCaptureSeed,
  intervalMs: number,
  nowMs: number,
  hfPolicy: HfRecoveryPolicyV2Config,
): Promise<ReferenceCaptureSession> {
  const atomic = await repo.requestHfCalibrationPhaseAtomic({
    organizationId: seed.organizationId,
    sessionId: seed.sessionId,
    vehicleId: seed.vehicleId,
    tokenId: seed.tokenId,
    effectivePollIntervalMs: intervalMs,
    nowMs,
  });
  if (!atomic) throw new Error('Phase request returned null');

  const state = parseAcquisitionState(atomic.session.acquisitionStateJson);
  if (state.hfCalibrationSeries?.pendingPhaseRequest) {
    return activatePendingPhaseAtBoundary(
      repo,
      seed.organizationId,
      seed.sessionId,
      hfPolicy,
      nowMs,
    );
  }
  return atomic.session;
}

export function buildNativeCountersForPhase(
  phaseId: string,
  temporalBucketStartTimestamps: string[],
): HfCalibrationPhaseRuntimeCounters {
  let counters: HfCalibrationPhaseRuntimeCounters | null = null;
  for (const ts of temporalBucketStartTimestamps) {
    counters = accumulatePhaseQueryMetrics(
      counters,
      {
        record: {
          status: 'SUCCESS',
          resultBucketCount: 1,
          duplicateBucketCount: 0,
          revisionBucketCount: 0,
          recoveredLateBucketCount: 0,
          maxIntraResponseTemporalGapMs: 1000,
          windowClassification: 'PHASE_NATIVE',
          queryOrigin: 'FAST_LOOP',
        },
        newBucketCount: 1,
        temporalBucketStartTimestamps: [ts],
      },
      phaseId,
    );
  }
  if (!counters) {
    throw new Error(`No native counters built for phase ${phaseId}`);
  }
  return counters;
}

/** Canonical acquisition-cycle path used by ReferenceCaptureAcquisitionService. */
export async function persistCountersViaCanonicalCycleRelease(
  repo: ReferenceCaptureSessionRepository,
  seed: ReferenceCaptureSeed,
  counters: HfCalibrationPhaseRuntimeCounters,
  hfPolicy: HfRecoveryPolicyV2Config,
  effectiveAtMs: number,
): Promise<void> {
  const cycleJobId = `cycle-${randomUUID()}`;
  const acquired = await repo.tryAcquireCycleLock(
    seed.organizationId,
    seed.sessionId,
    cycleJobId,
  );
  if (!acquired.acquired) {
    throw new Error(`Failed to acquire cycle lock for session ${seed.sessionId}`);
  }
  const session = await repo.findById(seed.organizationId, seed.sessionId);
  if (!session) throw new Error(`Session ${seed.sessionId} not found`);
  const current = parseAcquisitionState(session.acquisitionStateJson);
  const released = await repo.releaseCycleLockAndUpdateState(
    seed.organizationId,
    seed.sessionId,
    cycleJobId,
    {
      dataPlane: {
        ...current,
        hfCalibrationActiveCounters: counters,
      },
      hfPolicy,
      effectiveAtMs,
    },
  );
  if (!released) {
    throw new Error(`Cycle release failed for session ${seed.sessionId}`);
  }
}

export async function reloadSessionFromPostgres(
  organizationId: string,
  sessionId: string,
): Promise<{
  prisma: PrismaClient;
  repo: ReferenceCaptureSessionRepository;
  session: ReferenceCaptureSession;
}> {
  const prisma = new PrismaClient();
  const repo = createRepository(prisma);
  const session = await repo.findById(organizationId, sessionId);
  if (!session) {
    await prisma.$disconnect().catch(() => undefined);
    throw new Error(`Session ${sessionId} missing after PostgreSQL reload`);
  }
  return { prisma, repo, session };
}

export async function seedPreRollCalibrationSeries(
  prisma: PrismaClient,
  seed: ReferenceCaptureSeed,
  nowMs: number,
): Promise<void> {
  const preRollSeries = switchHfCalibrationPhase({
    existing: null,
    vehicleId: seed.vehicleId,
    tokenId: seed.tokenId,
    effectivePollIntervalMs: 60_000,
    nowMs,
    phaseProvenance: 'PRE_ROLL',
  }).series;
  const acquisitionState = emptyDataPlane(nowMs);
  acquisitionState.hfCalibrationSeries = preRollSeries;
  await prisma.referenceCaptureSession.update({
    where: { id: seed.sessionId },
    data: { acquisitionStateJson: acquisitionState as object },
  });
}

export async function seedSettlementShadowObservation(args: {
  prisma: PrismaClient;
  seed: ReferenceCaptureSeed;
  experimentId: string;
  probeId: string;
  scheduledAgeMs: number;
  observationJson: Record<string, unknown>;
  sourceIntervalStart: Date;
  sourceIntervalEnd: Date;
}): Promise<{ scheduleId: string; observationId: string }> {
  const experiment = await args.prisma.referenceCaptureSettlementShadowExperiment.create({
    data: {
      experimentId: args.experimentId,
      sessionId: args.seed.sessionId,
      organizationId: args.seed.organizationId,
      vehicleId: args.seed.vehicleId,
      tokenId: args.seed.tokenId,
      status: 'ACTIVE',
    },
  });
  const now = new Date();
  const schedule = await args.prisma.referenceCaptureSettlementShadowSchedule.create({
    data: {
      experimentId: experiment.id,
      sessionId: args.seed.sessionId,
      organizationId: args.seed.organizationId,
      vehicleId: args.seed.vehicleId,
      tokenId: args.seed.tokenId,
      probeId: args.probeId,
      probeType: 'FIXED_INTERVAL',
      phase: '60s',
      sourceIntervalStart: args.sourceIntervalStart,
      sourceIntervalEnd: args.sourceIntervalEnd,
      queryFrom: args.sourceIntervalStart,
      queryTo: args.sourceIntervalEnd,
      scheduledAgeMs: args.scheduledAgeMs,
      scheduledAt: now,
      status: 'COMPLETED',
      idempotencyKey: `pg-proof-${randomUUID()}`,
    },
  });
  const observation = await args.prisma.referenceCaptureSettlementShadowObservation.create({
    data: {
      scheduleId: schedule.id,
      experimentId: experiment.id,
      sessionId: args.seed.sessionId,
      organizationId: args.seed.organizationId,
      vehicleId: args.seed.vehicleId,
      tokenId: args.seed.tokenId,
      probeId: args.probeId,
      probeType: 'FIXED_INTERVAL',
      phase: '60s',
      sourceIntervalStart: args.sourceIntervalStart,
      sourceIntervalEnd: args.sourceIntervalEnd,
      scheduledAgeMs: args.scheduledAgeMs,
      actualAgeMs: args.scheduledAgeMs + 50,
      scheduleDriftMs: 50,
      requestStartedAt: now,
      requestCompletedAt: now,
      queryFrom: args.sourceIntervalStart,
      queryTo: args.sourceIntervalEnd,
      aggregationInterval: '1s',
      providerRequestStatus: 'SUCCESS',
      providerError: null,
      rawRowCount: 5,
      responseHash: `hash-${randomUUID()}`,
      observationJson: args.observationJson as Prisma.InputJsonValue,
    },
  });
  return { scheduleId: schedule.id, observationId: observation.id };
}
