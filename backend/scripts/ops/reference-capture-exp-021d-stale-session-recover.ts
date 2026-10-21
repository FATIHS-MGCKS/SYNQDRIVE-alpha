/**
 * EXP-021D — Recover orphaned Reference Capture cycle lock and abort stale session.
 * Uses canonical repository release + session abort (no raw SQL status mutation).
 */
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureConfig } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture.config';
import {
  parseAcquisitionState,
  ReferenceCaptureSessionRepository,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import type { ReferenceCaptureCycleDataPlaneState } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-calibration-phase.policy';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function toDataPlane(state: ReturnType<typeof parseAcquisitionState>): ReferenceCaptureCycleDataPlaneState {
  return {
    cycleCount: state.cycleCount ?? 0,
    lastCycleAt: state.lastCycleAt ?? null,
    hfWatermarkAt: state.hfWatermarkAt ?? null,
    hfWatermarkByField: state.hfWatermarkByField ?? {},
    hfQueryCoverageByField: state.hfQueryCoverageByField ?? {},
    hfPhysicalIdentityVersion: state.hfPhysicalIdentityVersion ?? 'AGGREGATE_BUCKET_V2',
    hfQueryProvenanceRing: state.hfQueryProvenanceRing ?? [],
    hfRecoveryCursorByField: state.hfRecoveryCursorByField ?? {},
    lastRecoverySweepAt: state.lastRecoverySweepAt ?? null,
    recoverySweepCount: state.recoverySweepCount ?? 0,
    lastHfHistoricalPollAt: state.lastHfHistoricalPollAt ?? null,
    eventWatermarkAt: state.eventWatermarkAt ?? null,
    seenEventFingerprints: state.seenEventFingerprints ?? [],
    seenPhysicalSampleFingerprints: state.seenPhysicalSampleFingerprints ?? [],
    lastSequenceNumber: state.lastSequenceNumber ?? 0,
    quarantinedProviderFields: state.quarantinedProviderFields ?? [],
    consecutiveTransientFailures: state.consecutiveTransientFailures ?? 0,
    lastFailureClass: state.lastFailureClass ?? null,
    lastFailureAt: state.lastFailureAt ?? null,
    hfCalibrationActiveCounters: state.hfCalibrationActiveCounters ?? null,
  };
}

function redisConnection(): { host: string; port: number; password?: string; db?: number } {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : undefined,
  };
}

async function main(): Promise<void> {
  const organizationId = process.env.ORGANIZATION_ID;
  const sessionId = process.env.SESSION_ID;
  const abortReason = process.env.ABORT_REASON ?? 'exp021d_stale_pre_exp019_orphan_cleanup';

  if (!organizationId || !sessionId) {
    throw new Error('ORGANIZATION_ID and SESSION_ID are required');
  }

  loadEnv();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });

  try {
    const prisma = app.get(PrismaService);
    const sessionRepo = app.get(ReferenceCaptureSessionRepository);
    const sessionService = app.get(ReferenceCaptureSessionService);
    const rcConfig = app.get(ReferenceCaptureConfig);

    const before = await sessionRepo.findById(organizationId, sessionId);
    if (!before) throw new Error(`Session ${sessionId} not found`);

    const beforeState = parseAcquisitionState(before.acquisitionStateJson);
    const activeCycleJobId = beforeState.activeCycleJobId;
    let orphanLockReleased = false;

    if (activeCycleJobId) {
      const conn = new Redis(redisConnection());
      const queue = new Queue('reference.capture.recording', { connection: conn });
      const job = await queue.getJob(activeCycleJobId);
      const jobState = job ? await job.getState() : 'missing';
      await queue.close();
      await conn.quit();

      if (job && (jobState === 'active' || jobState === 'waiting' || jobState === 'delayed')) {
        throw new Error(
          `Refusing orphan lock release: cycle job ${activeCycleJobId} still ${jobState} in BullMQ`,
        );
      }

      const tokenId = beforeState.hfCalibrationSeries?.tokenId ?? 0;
      const hfPolicy = rcConfig.resolveHfRecoveryPolicyForToken(tokenId);
      const released = await sessionRepo.releaseCycleLockAndUpdateState(
        organizationId,
        sessionId,
        activeCycleJobId,
        {
          dataPlane: toDataPlane(beforeState),
          hfPolicy,
          effectiveAtMs: Date.now(),
        },
        before.eventWatermarkAt,
      );
      if (!released) {
        throw new Error(`releaseCycleLockAndUpdateState failed for job ${activeCycleJobId}`);
      }
      orphanLockReleased = true;
    }

    const aborted = await sessionService.abortSession(organizationId, sessionId, abortReason);
    const obsCount = await prisma.referenceCaptureObservation.count({ where: { sessionId } });

    console.log(
      JSON.stringify(
        {
          orphanLockReleased,
          previousActiveCycleJobId: activeCycleJobId,
          finalStatus: aborted.status,
          failureReason: aborted.failureReason,
          completedAt: aborted.completedAt,
          observationCount: obsCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('RECOVER_FAILED', error);
  process.exit(1);
});
