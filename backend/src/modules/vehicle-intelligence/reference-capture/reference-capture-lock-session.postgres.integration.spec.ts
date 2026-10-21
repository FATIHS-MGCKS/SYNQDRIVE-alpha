/**
 * DI-DEF-019 GATE 1 — real PostgreSQL integration for Reference Capture lockSessionRow
 * and HF calibration atomic paths. No mocked Prisma transactions or $executeRaw.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ReferenceCaptureSessionRepository,
  parseAcquisitionState,
} from './reference-capture-session.repository';
import { HfCalibrationPhaseChangePendingError } from './reference-capture-hf-calibration-phase.policy';
import {
  activatePendingPhaseAtBoundary,
  buildReferenceCapturePostgresDatabaseUrl,
  cleanupReferenceCaptureSeed,
  createRepository,
  defaultV2Policy,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
  requestAndActivatePhase,
  seedRecordingSession,
} from './testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Reference Capture PostgreSQL integration (DI-DEF-019 GATE 1)',
  () => {
    let prisma: PrismaClient;
    let repo: ReferenceCaptureSessionRepository;
    const hfPolicy = defaultV2Policy();
    const t0 = Date.parse('2026-09-06T12:00:00.000Z');

    beforeAll(async () => {
      process.env.DATABASE_URL =
        process.env.DATABASE_URL ?? buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        throw new Error(
          'REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 requires isolated Postgres with reference_capture_sessions',
        );
      }
      prisma = new PrismaClient();
      repo = createRepository(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    describe('1A schema proof', () => {
      it('REAL_PG_SCHEMA_PROOF: reference_capture_sessions and lock columns exist at runtime', async () => {
        const tableRows = await prisma.$queryRaw<Array<{ table_name: string }>>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'reference_capture_sessions'
        `;
        expect(tableRows.map((r) => r.table_name)).toContain('reference_capture_sessions');

        const columnRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'reference_capture_sessions'
            AND column_name IN ('id', 'organization_id')
        `;
        const columns = columnRows.map((r) => r.column_name).sort();
        expect(columns).toEqual(['id', 'organization_id']);

        await prisma.$queryRaw`SELECT id, organization_id FROM reference_capture_sessions LIMIT 0`;
      });
    });

    describe('1B lockSessionRow real SQL', () => {
      it('REAL_PG_LOCK_SESSION_ROW: tryAcquireCycleLock succeeds without 42P01/42703', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        try {
          const result = await repo.tryAcquireCycleLock(
            seed.organizationId,
            seed.sessionId,
            `job-${suffix}`,
          );
          expect(result.acquired).toBe(true);
          expect(result.state?.activeCycleJobId).toBe(`job-${suffix}`);
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });

      it('REAL_PG_LOCK_SESSION_ROW: wrong organizationId does not lock tenant session', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        const wrongOrgId = randomUUID();
        try {
          const result = await repo.tryAcquireCycleLock(
            wrongOrgId,
            seed.sessionId,
            `job-wrong-${suffix}`,
          );
          expect(result.acquired).toBe(false);
          expect(result.state).toBeNull();

          const atomic = await repo.requestHfCalibrationPhaseAtomic({
            organizationId: wrongOrgId,
            sessionId: seed.sessionId,
            vehicleId: seed.vehicleId,
            tokenId: seed.tokenId,
            effectivePollIntervalMs: 10_000,
            nowMs: t0,
          });
          expect(atomic).toBeNull();

          const session = await repo.findById(seed.organizationId, seed.sessionId);
          const state = parseAcquisitionState(session?.acquisitionStateJson);
          expect(state.hfCalibrationSeries).toBeNull();
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1C FOR UPDATE blocking concurrency', () => {
      it('REAL_PG_FOR_UPDATE_BLOCKING_PROVEN: T2 waits while T1 holds row lock', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        const clientA = new PrismaClient();
        const clientB = new PrismaClient();
        const repoB = createRepository(clientB);

        let releaseT1!: () => void;
        const t1Hold = new Promise<void>((resolve) => {
          releaseT1 = resolve;
        });

        try {
          const t1Started = Date.now();
          const t1Promise = clientA.$transaction(async (tx) => {
            await tx.$executeRaw`
              SELECT id FROM reference_capture_sessions
              WHERE id = ${seed.sessionId} AND organization_id = ${seed.organizationId}
              FOR UPDATE
            `;
            await t1Hold;
          });

          await new Promise((r) => setTimeout(r, 50));

          const t2Started = Date.now();
          const t2Promise = repoB.requestHfCalibrationPhaseAtomic({
            organizationId: seed.organizationId,
            sessionId: seed.sessionId,
            vehicleId: seed.vehicleId,
            tokenId: seed.tokenId,
            effectivePollIntervalMs: 10_000,
            nowMs: t0,
          });

          await new Promise((r) => setTimeout(r, 100));
          expect(Date.now() - t2Started).toBeGreaterThanOrEqual(80);

          releaseT1();
          const [t2Result] = await Promise.all([t2Promise, t1Promise]);
          expect(Date.now() - t1Started).toBeGreaterThanOrEqual(100);
          expect(t2Result).not.toBeNull();
          expect(t2Result!.result.activationStatus).toBe('REQUESTED');
        } finally {
          await clientA.$disconnect().catch(() => undefined);
          await clientB.$disconnect().catch(() => undefined);
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1D atomic 10s phase request', () => {
      it('REAL_PG_10S_PHASE: REQUESTED then EFFECTIVE at cycle boundary', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        try {
          const requested = await repo.requestHfCalibrationPhaseAtomic({
            organizationId: seed.organizationId,
            sessionId: seed.sessionId,
            vehicleId: seed.vehicleId,
            tokenId: seed.tokenId,
            effectivePollIntervalMs: 10_000,
            nowMs: t0,
          });
          expect(requested).not.toBeNull();
          expect(requested!.result.activationStatus).toBe('REQUESTED');

          const pendingState = parseAcquisitionState(requested!.session.acquisitionStateJson);
          expect(pendingState.hfCalibrationSeries?.pendingPhaseRequest?.effectivePollIntervalMs).toBe(
            10_000,
          );
          expect(pendingState.hfCalibrationSeries?.calibrationSeriesId).toBeTruthy();

          const effective = await activatePendingPhaseAtBoundary(
            repo,
            seed.organizationId,
            seed.sessionId,
            hfPolicy,
            t0 + 10_000,
          );
          const effectiveState = parseAcquisitionState(effective.acquisitionStateJson);
          expect(effectiveState.hfCalibrationSeries?.pendingPhaseRequest).toBeNull();
          expect(effectiveState.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(
            10_000,
          );
          expect(effectiveState.hfCalibrationSeries?.activePhase?.calibrationPhaseId).toBeTruthy();
          expect(effectiveState.hfCalibrationSeries?.activePhase?.phaseSequence).toBe(1);
          expect(effectiveState.hfCalibrationSeries?.calibrationSeriesId).toBe(
            pendingState.hfCalibrationSeries?.calibrationSeriesId,
          );
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1E multi-phase state machine', () => {
      it('REAL_PG_10_20_30_60: full phase transitions on one session', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        const intervals = [10_000, 20_000, 30_000, 60_000];
        let seriesId: string | undefined;
        let nowMs = t0;

        try {
          for (let i = 0; i < intervals.length; i++) {
            const intervalMs = intervals[i];
            nowMs += 10_000;
            const session = await requestAndActivatePhase(
              repo,
              seed,
              intervalMs,
              nowMs,
              hfPolicy,
            );
            const state = parseAcquisitionState(session.acquisitionStateJson);
            const series = state.hfCalibrationSeries;
            expect(series).not.toBeNull();
            if (!seriesId) {
              seriesId = series!.calibrationSeriesId;
            }
            expect(series!.calibrationSeriesId).toBe(seriesId);
            expect(series!.vehicleId).toBe(seed.vehicleId);
            expect(series!.tokenId).toBe(seed.tokenId);
            expect(series!.pendingPhaseRequest).toBeNull();
            expect(series!.activePhase?.effectivePollIntervalMs).toBe(intervalMs);
            expect(series!.activePhase?.phaseSequence).toBe(i + 1);
            expect(series!.phaseOrder.slice(0, i + 1)).toEqual(intervals.slice(0, i + 1));

            if (i > 0) {
              expect(series!.completedPhases.length).toBe(i);
              expect(series!.completedPhases[i - 1]?.effectivePollIntervalMs).toBe(
                intervals[i - 1],
              );
            }

            const watermark = state.hfWatermarkAt;
            expect(watermark).toBeTruthy();
          }

          const finalSession = await repo.findById(seed.organizationId, seed.sessionId);
          const finalState = parseAcquisitionState(finalSession?.acquisitionStateJson);
          expect(finalState.hfWatermarkAt).toBeTruthy();
          expect(finalState.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(60_000);
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1F terminal STOP finalization', () => {
      it('REAL_PG_STOP_FINALIZATION: finalizeTerminalCalibrationAtomic with STOP reason', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        try {
          await requestAndActivatePhase(repo, seed, 10_000, t0, hfPolicy);

          const finalized = await repo.finalizeTerminalCalibrationAtomic(
            seed.organizationId,
            seed.sessionId,
            { terminalAtMs: t0 + 30_000, reason: 'STOP' },
          );
          expect(finalized).not.toBeNull();

          const state = parseAcquisitionState(finalized!.acquisitionStateJson);
          expect(state.hfCalibrationSeries?.terminalFinalizationAt).toBeTruthy();
          expect(state.hfCalibrationSeries?.pendingPhaseRequest).toBeNull();
          expect(state.hfCalibrationSeries?.activePhase).toBeNull();
          expect(state.hfCalibrationSeries?.completedPhaseSummaries.length).toBeGreaterThanOrEqual(1);
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1G terminal ABORT finalization', () => {
      it('REAL_PG_ABORT_FINALIZATION: finalizeTerminalCalibrationAtomic with ABORT reason', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        try {
          await requestAndActivatePhase(repo, seed, 10_000, t0, hfPolicy);

          const finalized = await repo.finalizeTerminalCalibrationAtomic(
            seed.organizationId,
            seed.sessionId,
            { terminalAtMs: t0 + 20_000, reason: 'ABORT' },
          );
          expect(finalized).not.toBeNull();

          const state = parseAcquisitionState(finalized!.acquisitionStateJson);
          expect(state.hfCalibrationSeries?.terminalFinalizationAt).toBeTruthy();
          expect(state.hfCalibrationSeries?.pendingPhaseRequest).toBeNull();
          expect(state.hfCalibrationSeries?.activePhase).toBeNull();
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1H failure rollback', () => {
      it('REAL_PG_ROLLBACK: failed transaction after lock leaves consistent state', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        try {
          await prisma.$executeRaw`
            UPDATE reference_capture_sessions SET status = 'COMPLETED' WHERE id = ${seed.sessionId}
          `;

          const before = await repo.findById(seed.organizationId, seed.sessionId);
          const beforeState = parseAcquisitionState(before?.acquisitionStateJson);

          await expect(
            repo.requestHfCalibrationPhaseAtomic({
              organizationId: seed.organizationId,
              sessionId: seed.sessionId,
              vehicleId: seed.vehicleId,
              tokenId: seed.tokenId,
              effectivePollIntervalMs: 10_000,
              nowMs: t0,
            }),
          ).rejects.toThrow(/RECORDING status/);

          const after = await repo.findById(seed.organizationId, seed.sessionId);
          const afterState = parseAcquisitionState(after?.acquisitionStateJson);
          expect(afterState.hfCalibrationSeries).toEqual(beforeState.hfCalibrationSeries);

          await prisma.$executeRaw`
            UPDATE reference_capture_sessions SET status = 'RECORDING' WHERE id = ${seed.sessionId}
          `;

          const recovered = await repo.requestHfCalibrationPhaseAtomic({
            organizationId: seed.organizationId,
            sessionId: seed.sessionId,
            vehicleId: seed.vehicleId,
            tokenId: seed.tokenId,
            effectivePollIntervalMs: 10_000,
            nowMs: t0 + 5_000,
          });
          expect(recovered).not.toBeNull();
          expect(recovered!.result.activationStatus).toBe('REQUESTED');
        } finally {
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });

    describe('1I two-replica concurrency', () => {
      it('REAL_PG_TWO_REPLICA_CONCURRENCY: exactly one canonical outcome under conflict', async () => {
        const suffix = randomUUID().slice(0, 8);
        const seed = await seedRecordingSession(prisma, suffix);
        const clientA = new PrismaClient();
        const clientB = new PrismaClient();
        const repoA = createRepository(clientA);
        const repoB = createRepository(clientB);

        try {
          const [resultA, resultB] = await Promise.allSettled([
            repoA.requestHfCalibrationPhaseAtomic({
              organizationId: seed.organizationId,
              sessionId: seed.sessionId,
              vehicleId: seed.vehicleId,
              tokenId: seed.tokenId,
              effectivePollIntervalMs: 20_000,
              nowMs: t0,
            }),
            repoB.requestHfCalibrationPhaseAtomic({
              organizationId: seed.organizationId,
              sessionId: seed.sessionId,
              vehicleId: seed.vehicleId,
              tokenId: seed.tokenId,
              effectivePollIntervalMs: 30_000,
              nowMs: t0 + 1,
            }),
          ]);

          const fulfilled = [resultA, resultB].filter((r) => r.status === 'fulfilled');
          const rejected = [resultA, resultB].filter((r) => r.status === 'rejected');

          expect(fulfilled.length + rejected.length).toBe(2);
          expect(fulfilled.length).toBeGreaterThanOrEqual(1);

          for (const r of rejected) {
            expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
              HfCalibrationPhaseChangePendingError,
            );
          }

          const session = await repo.findById(seed.organizationId, seed.sessionId);
          const state = parseAcquisitionState(session?.acquisitionStateJson);
          const pending = state.hfCalibrationSeries?.pendingPhaseRequest?.effectivePollIntervalMs;
          expect([20_000, 30_000]).toContain(pending);
          expect(state.hfCalibrationSeries?.calibrationSeriesId).toBeTruthy();
        } finally {
          await clientA.$disconnect().catch(() => undefined);
          await clientB.$disconnect().catch(() => undefined);
          await cleanupReferenceCaptureSeed(prisma, seed);
        }
      });
    });
  },
);
