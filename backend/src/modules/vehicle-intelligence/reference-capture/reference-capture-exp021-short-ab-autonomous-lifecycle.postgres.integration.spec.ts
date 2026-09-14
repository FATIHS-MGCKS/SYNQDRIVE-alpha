/**
 * PostgreSQL integration — short A/B autonomous lifecycle (90→60).
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { parseAcquisitionState } from './reference-capture-session.repository';
import { requestAndActivatePhase } from './testing/reference-capture-postgres.integration.harness';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  cleanupReferenceCaptureSeed,
  createRepository,
  defaultV2Policy,
  emptyDataPlane,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
  seedRecordingSession,
} from './testing/reference-capture-postgres.integration.harness';
import {
  armShortAb90PhaseFromPersistedT0,
  createPostgresExp021Driver,
  EXP021_PG_MOVING_SAMPLE,
  reloadSessionRow,
} from './testing/reference-capture-exp021-postgres-driver.harness';
import { cadenceSequenceFromPlan, EXP021_CANDIDATE_SHORT_AB_90_60 } from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.REFERENCE_CAPTURE_POSTGRES_REQUIRED === '1';
const TEN_MIN_MS = 10 * 60_000;

(LIVE ? describe : describe.skip)(
  'EXP-021 short A/B autonomous lifecycle PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let repo: ReturnType<typeof createRepository>;
    const hfPolicy = defaultV2Policy();
    const t0Ms = Date.parse('2026-09-14T11:43:53.000Z');
    const cadences = cadenceSequenceFromPlan(EXP021_CANDIDATE_SHORT_AB_90_60);

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      process.env.EXP021_CALIBRATION_PLAN = 'CANDIDATE_SHORT_AB_90_60';
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        const message =
          'REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 requires isolated Postgres with reference_capture_sessions';
        if (REQUIRED) throw new Error(message);
        throw new Error(`${message} (LOCAL_SKIP)`);
      }
      prisma = new PrismaClient();
      repo = createRepository(prisma);
    }, 120_000);

    afterAll(async () => {
      delete process.env.EXP021_CALIBRATION_PLAN;
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('POSTGRES_ISOLATION_GUARD: rejects production-like DATABASE_URL targets', () => {
      const previousUrl = process.env.DATABASE_URL;
      const previousDb = process.env.TEST_POSTGRES_DATABASE;
      try {
        process.env.TEST_POSTGRES_DATABASE = 'synqdrive';
        process.env.DATABASE_URL =
          'postgresql://user:pass@127.0.0.1:5432/synqdrive?schema=public';
        expect(() => proveIsolatedReferenceCapturePostgres()).toThrow(/Refusing non-isolated/);

        process.env.DATABASE_URL =
          'postgresql://user:pass@srv1374778.hstgr.cloud:5432/synqdrive_exp021_pr1649_test?schema=public';
        expect(() => proveIsolatedReferenceCapturePostgres()).toThrow(/Refusing non-isolated/);
      } finally {
        process.env.DATABASE_URL = previousUrl;
        process.env.TEST_POSTGRES_DATABASE = previousDb;
        proveIsolatedReferenceCapturePostgres();
      }
    });

    it('REAL_DB_SHORT_AB: T0 persist → 90s arm (7 slots) → 60s transition (10 slots) → terminal STOP', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 192_922 });
      const orchestratorRunId = `exp021-pg-${suffix}`;
      try {
        await prisma.referenceCaptureSession.update({
          where: { id: seed.sessionId },
          data: {
            preflightJson: {
              exp021AutonomousOrchestrator: { runId: orchestratorRunId, startedAt: new Date(t0Ms).toISOString() },
            },
            acquisitionStateJson: emptyDataPlane(t0Ms - 60_000) as object,
          },
        });

        await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: new Date(t0Ms),
          startConfirmedAt: new Date(t0Ms + 1_000),
          nowMs: t0Ms + 1_000,
        });

        const armed90 = await repo.activatePhysicalPhaseAtT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: cadences[0],
          hfPolicy,
          nowMs: t0Ms + 2_000,
        });
        expect(armed90?.activePhase.effectivePollIntervalMs).toBe(90_000);
        expect(armed90?.series.calibrationPlanId).toBe('candidate_short_ab_90_60');
        const st90 = parseAcquisitionState(armed90?.session.acquisitionStateJson);
        expect(st90.hfCalibrationActiveCounters?.exp021RequestSlots?.length).toBe(7);

        const atBoundary = await requestAndActivatePhase(
          repo,
          seed,
          cadences[1],
          t0Ms + TEN_MIN_MS,
          hfPolicy,
          'PHYSICAL_TRANSITION',
        );
        const st60 = parseAcquisitionState(atBoundary.acquisitionStateJson);
        expect(st60.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(60_000);
        expect(st60.hfCalibrationActiveCounters?.exp021RequestSlots?.length).toBe(10);
        expect(st60.hfCalibrationSeries?.phaseOrder).toEqual([90_000, 60_000]);
        expect(st60.hfCalibrationSeries?.completedPhaseSummaries?.length).toBeGreaterThanOrEqual(1);

        const finalized = await repo.finalizeTerminalCalibrationAtomic(
          seed.organizationId,
          seed.sessionId,
          { terminalAtMs: t0Ms + 2 * TEN_MIN_MS, reason: 'STOP' },
        );
        expect(finalized).not.toBeNull();
        const finalizedState = parseAcquisitionState(finalized?.acquisitionStateJson);
        expect(finalizedState.hfCalibrationSeries?.terminalFinalizationAt).toBeTruthy();
        expect(countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(7);
        expect(countIntendedSlotsForCadence(60_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(10);
        expect(st60.hfCalibrationSeries?.phaseOrder.includes(120_000)).toBe(false);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_DB_DRIVER_RESTART_90: canonical driver resumes 90s phase from PostgreSQL authority', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 192_922 });
      let clock = t0Ms + 5 * 60_000;
      try {
        await prisma.referenceCaptureSession.update({
          where: { id: seed.sessionId },
          data: { acquisitionStateJson: emptyDataPlane(t0Ms - 60_000) as object },
        });
        await armShortAb90PhaseFromPersistedT0({
          repo,
          seed,
          hfPolicy,
          t0Ms,
          cadence90Ms: cadences[0],
        });

        const reloaded = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const seriesIdBefore = parseAcquisitionState(reloaded.acquisitionStateJson).hfCalibrationSeries
          ?.calibrationSeriesId;

        const driver = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        const resume = driver.tryResumeFromRecordingSession(reloaded);
        expect(resume).toBe('driving');
        expect(driver.currentPhaseIndex).toBe(0);

        const duplicateT0 = await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: new Date(t0Ms),
          startConfirmedAt: new Date(t0Ms + 1_000),
          nowMs: clock,
        });
        expect(duplicateT0?.created).toBe(false);

        clock = t0Ms + TEN_MIN_MS;
        const tick = await driver.tickDriving(EXP021_PG_MOVING_SAMPLE);
        expect(tick.status).toBe('continue');

        const afterTransition = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const st = parseAcquisitionState(afterTransition.acquisitionStateJson);
        expect(st.hfCalibrationSeries?.calibrationSeriesId).toBe(seriesIdBefore);
        expect(st.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(60_000);
        expect(st.hfCalibrationSeries?.phaseOrder).toEqual([90_000, 60_000]);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_DB_DRIVER_RESTART_BOUNDARY: driver performs single 90→60 transition after PostgreSQL reload', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 192_922 });
      let clock = t0Ms + TEN_MIN_MS - 1_000;
      try {
        await prisma.referenceCaptureSession.update({
          where: { id: seed.sessionId },
          data: { acquisitionStateJson: emptyDataPlane(t0Ms - 60_000) as object },
        });
        await armShortAb90PhaseFromPersistedT0({
          repo,
          seed,
          hfPolicy,
          t0Ms,
          cadence90Ms: cadences[0],
        });

        const reloaded = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const driver = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        driver.tryResumeFromRecordingSession(reloaded);

        clock = t0Ms + TEN_MIN_MS;
        await driver.tickDriving(EXP021_PG_MOVING_SAMPLE);

        const after = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const st = parseAcquisitionState(after.acquisitionStateJson);
        expect(st.hfCalibrationSeries?.activePhase?.effectivePollIntervalMs).toBe(60_000);
        expect(st.hfCalibrationSeries?.completedPhaseSummaries?.length).toBe(1);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_DB_DRIVER_RESTART_AFTER_TRANSITION: PostgreSQL reload preserves 60s slot geometry', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 192_922 });
      let clock = t0Ms + TEN_MIN_MS;
      try {
        await prisma.referenceCaptureSession.update({
          where: { id: seed.sessionId },
          data: { acquisitionStateJson: emptyDataPlane(t0Ms - 60_000) as object },
        });
        await armShortAb90PhaseFromPersistedT0({
          repo,
          seed,
          hfPolicy,
          t0Ms,
          cadence90Ms: cadences[0],
        });
        await requestAndActivatePhase(
          repo,
          seed,
          cadences[1],
          t0Ms + TEN_MIN_MS,
          hfPolicy,
          'PHYSICAL_TRANSITION',
        );

        const reloaded = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const driver = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        const resume = driver.tryResumeFromRecordingSession(reloaded);
        expect(resume).toBe('driving');
        expect(driver.currentPhaseIndex).toBe(1);

        const st = parseAcquisitionState(reloaded.acquisitionStateJson);
        expect(st.hfCalibrationActiveCounters?.exp021RequestSlots?.length).toBe(10);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_DB_DRIVER_RESTART_AFTER_TERMINAL: terminal PostgreSQL state is not reopened by driver resume', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 192_922 });
      let clock = t0Ms + 2 * TEN_MIN_MS;
      try {
        await prisma.referenceCaptureSession.update({
          where: { id: seed.sessionId },
          data: { acquisitionStateJson: emptyDataPlane(t0Ms - 60_000) as object },
        });
        await armShortAb90PhaseFromPersistedT0({
          repo,
          seed,
          hfPolicy,
          t0Ms,
          cadence90Ms: cadences[0],
        });
        await requestAndActivatePhase(
          repo,
          seed,
          cadences[1],
          t0Ms + TEN_MIN_MS,
          hfPolicy,
          'PHYSICAL_TRANSITION',
        );
        await repo.finalizeTerminalCalibrationAtomic(seed.organizationId, seed.sessionId, {
          terminalAtMs: clock,
          reason: 'STOP',
        });

        const reloaded = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const driver = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        const resume = driver.tryResumeFromRecordingSession(reloaded);
        expect(resume).toBe('wait_movement');
        expect(driver.physicalDriveEnded).toBe(false);

        const duplicateT0 = await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: new Date(t0Ms),
          startConfirmedAt: new Date(t0Ms + 1_000),
          nowMs: clock,
        });
        expect(duplicateT0?.created).toBe(false);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });
  },
);
