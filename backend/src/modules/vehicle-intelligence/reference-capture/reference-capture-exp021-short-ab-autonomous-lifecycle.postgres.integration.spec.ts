/**
 * PostgreSQL integration — short A/B autonomous lifecycle (90→60) at repository layer.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { parseAcquisitionState } from './reference-capture-session.repository';
import { activatePendingPhaseAtBoundary } from './testing/reference-capture-postgres.integration.harness';
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
import { cadenceSequenceFromPlan, EXP021_CANDIDATE_SHORT_AB_90_60 } from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';
const PLAN_ENV = { EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60' };
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
        throw new Error('REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 requires isolated Postgres');
      }
      prisma = new PrismaClient();
      repo = createRepository(prisma);
    }, 120_000);

    afterAll(async () => {
      delete process.env.EXP021_CALIBRATION_PLAN;
      await prisma?.$disconnect().catch(() => undefined);
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

        await repo.requestHfCalibrationPhaseAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: cadences[1],
          nowMs: t0Ms + TEN_MIN_MS - 1,
        });
        const atBoundary = await activatePendingPhaseAtBoundary(
          repo,
          seed.organizationId,
          seed.sessionId,
          hfPolicy,
          t0Ms + TEN_MIN_MS,
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
  },
);
