/**
 * PostgreSQL integration — short A/B autonomous lifecycle (90→60).
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { parseExp021PhysicalAuthority } from './reference-capture-exp-021-physical-authority.lib';
import { parseAcquisitionState } from './reference-capture-session.repository';
import {
  expectNo120Phase,
  expectPhaseOrder,
  expectPlanAuthority,
} from './reference-capture-exp021-short-ab-geometry.assertions';
import type { Exp021RequestSlotRecord } from './reference-capture-exp021-request-slots.lib';
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

type Mid60RestartSnapshot = {
  canonicalT0: string | null;
  calibrationSeriesId: string | null;
  active60PhaseId: string | null;
  active60PhaseStartedAt: string | null;
  phaseOrder: number[] | null;
  slotIdentities: string[];
};

function slotIdentitySet(slots: Exp021RequestSlotRecord[] | null | undefined): string[] {
  return (slots ?? []).map((slot) => `${slot.slotIndex}:${slot.offsetMs}:${slot.dueAtMs}`);
}

function captureMid60RestartSnapshot(
  sessionRow: { preflightJson: unknown; acquisitionStateJson: unknown },
): Mid60RestartSnapshot {
  const authority = parseExp021PhysicalAuthority(sessionRow.preflightJson);
  const st = parseAcquisitionState(sessionRow.acquisitionStateJson);
  const series = st.hfCalibrationSeries;
  return {
    canonicalT0: authority?.canonicalT0At ?? null,
    calibrationSeriesId: series?.calibrationSeriesId ?? null,
    active60PhaseId: series?.activePhase?.calibrationPhaseId ?? null,
    active60PhaseStartedAt: series?.activePhase?.phaseStartedAt ?? null,
    phaseOrder: series?.phaseOrder ?? null,
    slotIdentities: slotIdentitySet(st.hfCalibrationActiveCounters?.exp021RequestSlots),
  };
}

async function findOrchestratorAttachableRecording(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
) {
  return prisma.referenceCaptureSession.findFirst({
    where: {
      organizationId,
      vehicleId,
      status: 'RECORDING',
    },
    orderBy: { createdAt: 'desc' },
  });
}

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

    it('REAL_DB_DRIVER_RESTART_60_TO_TERMINAL: mid-60s PostgreSQL restart completes via canonical driver wall', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 192_922 });
      const restartClockMs = t0Ms + 15 * 60_000;
      const finalWallMs = t0Ms + 2 * TEN_MIN_MS;
      let clock = restartClockMs;
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

        const beforeRestart = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const preState = parseAcquisitionState(beforeRestart.acquisitionStateJson);
        const series = preState.hfCalibrationSeries;
        expect(series?.calibrationPlanId).toBe('candidate_short_ab_90_60');
        expect(series?.phaseOrder).toEqual([90_000, 60_000]);
        expect(series?.activePhase?.effectivePollIntervalMs).toBe(60_000);
        expect(series?.activePhase?.phaseProvenance).toBe('PHYSICAL_TRANSITION');
        expect(preState.hfCalibrationActiveCounters?.exp021RequestSlots?.length).toBe(10);
        expect(restartClockMs).toBeGreaterThan(t0Ms + TEN_MIN_MS);
        expect(restartClockMs).toBeLessThan(finalWallMs);

        const beforeSnapshot = captureMid60RestartSnapshot(beforeRestart);
        expect(beforeSnapshot.canonicalT0).toBeTruthy();
        expect(beforeSnapshot.calibrationSeriesId).toBeTruthy();
        expect(beforeSnapshot.active60PhaseId).toBeTruthy();
        expect(beforeSnapshot.active60PhaseStartedAt).toBeTruthy();
        expect(beforeSnapshot.slotIdentities.length).toBe(10);

        const driver1 = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        driver1.tryResumeFromRecordingSession(beforeRestart);
        void driver1;

        const reloaded = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const driver2 = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        const resume = driver2.tryResumeFromRecordingSession(reloaded);
        expect(resume).toBe('driving');
        expect(driver2.currentPhaseIndex).toBe(1);

        const afterResumeRow = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const afterResumeSnapshot = captureMid60RestartSnapshot(afterResumeRow);
        expect(afterResumeSnapshot.canonicalT0).toBe(beforeSnapshot.canonicalT0);
        expect(afterResumeSnapshot.calibrationSeriesId).toBe(beforeSnapshot.calibrationSeriesId);
        expect(afterResumeSnapshot.active60PhaseId).toBe(beforeSnapshot.active60PhaseId);
        expect(afterResumeSnapshot.active60PhaseStartedAt).toBe(beforeSnapshot.active60PhaseStartedAt);
        expect(afterResumeSnapshot.phaseOrder).toEqual(beforeSnapshot.phaseOrder);
        expect(afterResumeSnapshot.slotIdentities).toEqual(beforeSnapshot.slotIdentities);

        const duplicateT0 = await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: new Date(t0Ms),
          startConfirmedAt: new Date(t0Ms + 1_000),
          nowMs: clock,
        });
        expect(duplicateT0?.created).toBe(false);

        clock = finalWallMs;
        const done = await driver2.tickDriving(EXP021_PG_MOVING_SAMPLE);
        expect(done.status).toBe('done');
        expect(done.stopReason).toBe('FINAL_PHASE_WALL_CLOCK');

        const terminalRow = await reloadSessionRow(prisma, repo, seed.organizationId, seed.sessionId);
        const terminalState = parseAcquisitionState(terminalRow.acquisitionStateJson);
        const terminalSeries = terminalState.hfCalibrationSeries;
        expect(terminalSeries).toBeTruthy();
        if (!terminalSeries) throw new Error('missing hfCalibrationSeries after terminal');
        expectPlanAuthority(terminalSeries);
        expectPhaseOrder(terminalSeries);
        expectNo120Phase(terminalSeries);
        expect(terminalSeries.terminalFinalizationAt).toBeTruthy();
        expect(terminalSeries.pendingPhaseRequest).toBeNull();
        expect(terminalSeries.activePhase).toBeNull();
        expect(terminalSeries.completedPhaseSummaries?.length).toBe(2);
        expect(terminalSeries.completedPhases?.map((p) => p.effectivePollIntervalMs)).toEqual([
          90_000,
          60_000,
        ]);
        expect(
          terminalSeries.completedPhaseSummaries?.map((s) => s.effectivePollIntervalMs),
        ).toEqual([90_000, 60_000]);
        expect(countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(7);
        expect(countIntendedSlotsForCadence(60_000, EXP021_CANDIDATE_SHORT_AB_90_60)).toBe(10);

        const terminalSnapshot = captureMid60RestartSnapshot(terminalRow);
        expect(terminalSnapshot.canonicalT0).toBe(beforeSnapshot.canonicalT0);
        expect(terminalSnapshot.calibrationSeriesId).toBe(beforeSnapshot.calibrationSeriesId);
        expect(terminalSnapshot.phaseOrder).toEqual([90_000, 60_000]);

        const allSlotIdentities = new Set<string>(beforeSnapshot.slotIdentities);
        expect(allSlotIdentities.size).toBe(10);

        const attachable = await findOrchestratorAttachableRecording(
          prisma,
          seed.organizationId,
          seed.vehicleId,
        );
        expect(attachable).toBeNull();
        expect(terminalRow.status).toBe('COMPLETED');

        const terminalDriver = createPostgresExp021Driver({
          repo,
          seed,
          hfPolicy,
          getNowMs: () => clock,
          sessionId: seed.sessionId,
        });
        const terminalResume = terminalDriver.tryResumeFromRecordingSession(terminalRow);
        expect(terminalResume).toBe('wait_movement');
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
