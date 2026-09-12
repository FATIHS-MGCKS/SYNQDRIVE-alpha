/**
 * EXP-021 post-run correction — PostgreSQL integration (slot durability, movement reload, early-end).
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  buildInitialPhaseCounters,
  emptyPhaseCounters,
  finalizePhaseSummary,
  type HfCalibrationPhaseSummary,
} from './reference-capture-hf-calibration-phase.policy';
import {
  EXP021_CANDIDATE_BRACKET_V3,
  EXP021_UPPER_BOUND_V2,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  buildExp021RequestSlotsForPhase,
  markRequestSlotIssued,
  resolveExp021HfHistoricalPollDecision,
} from './reference-capture-exp021-request-slots.lib';
import { parseAcquisitionState } from './reference-capture-session.repository';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  cleanupReferenceCaptureSeed,
  createRepository,
  emptyDataPlane,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
  seedRecordingSession,
} from './testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'EXP-021 post-run correction PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let repo: ReturnType<typeof createRepository>;
    const t0Ms = Date.parse('2026-09-11T04:37:26.000Z');

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
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

    it('REQUEST_SLOT_DURABILITY: ISSUED slot survives reload and blocks duplicate issuance', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix);
      const slots = buildExp021RequestSlotsForPhase({
        phaseEffectiveStartMs: t0Ms,
        cadenceMs: 180_000,
        phaseDurationMs: 15 * 60_000,
      });
      const counters = {
        ...buildInitialPhaseCounters({
          calibrationPhaseId: 'phase-180',
          phaseEffectiveStartMs: t0Ms,
          cadenceMs: 180_000,
          phaseProvenance: 'PHYSICAL_T0',
        }),
        exp021RequestSlots: markRequestSlotIssued(slots, t0Ms).slots,
      };
      const state = emptyDataPlane(t0Ms);
      state.activeCycleJobId = `cycle-${suffix}`;
      state.hfCalibrationActiveCounters = counters;

      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: state as object },
      });

      try {
        const persisted = await repo.persistCalibrationCountersDuringCycle(
          seed.organizationId,
          seed.sessionId,
          state.activeCycleJobId!,
          counters,
        );
        expect(persisted).toBe(true);

        const reloadedPrisma = new PrismaClient();
        const reloadedRepo = createRepository(reloadedPrisma);
        const session = await reloadedRepo.findById(seed.organizationId, seed.sessionId);
        const reloaded = parseAcquisitionState(session?.acquisitionStateJson);
        expect(reloaded.hfCalibrationActiveCounters?.exp021RequestSlots?.[0]?.status).toBe('ISSUED');

        const decision = resolveExp021HfHistoricalPollDecision({
          nowMs: t0Ms + 500,
          slots: reloaded.hfCalibrationActiveCounters?.exp021RequestSlots ?? null,
          lastHfHistoricalPollAt: null,
          pollIntervalMs: 180_000,
          policyMode: 'V2',
        });
        expect(decision.pollAllowed).toBe(false);
        expect(decision.slotIndex).toBeNull();

        await reloadedPrisma.$disconnect();
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('VALID_MOVEMENT_RELOAD: persisted movement survives seal and Prisma reload', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix);
      const movementMs = 705_000;
      const phaseEndMs = t0Ms + 900_000;

      const counters = {
        ...emptyPhaseCounters('phase-180'),
        validMovementDurationMs: movementMs,
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: 5,
      };
      const state = emptyDataPlane(t0Ms);
      state.hfCalibrationSeries = {
        calibrationSeriesId: 'series',
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        phaseOrder: [180_000],
        activePhase: {
          calibrationPhaseId: 'phase-180',
          phaseSequence: 1,
          effectivePollIntervalMs: 180_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: null,
          phaseProvenance: 'PHYSICAL_T0',
          canonicalT0At: new Date(t0Ms).toISOString(),
          effectiveConfig: {
            calibrationSeriesId: 'series',
            calibrationPhaseId: 'phase-180',
            phaseSequence: 1,
            vehicleId: seed.vehicleId,
            tokenId: seed.tokenId,
            effectivePollIntervalMs: 180_000,
            settlementDelayMs: 8000,
            recoveryOverlapMs: 6000,
            policyVersion: 'HF_RECOVERY_V2_2026-09-04',
            policyMode: 'V2' as const,
            effectiveAt: new Date(t0Ms).toISOString(),
          },
        },
        completedPhases: [],
        completedPhaseSummaries: [],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: null,
        lastPhaseBoundaryAt: null,
        seriesStartedAt: new Date(t0Ms).toISOString(),
        controlPlaneRevision: 0,
      };
      state.hfCalibrationActiveCounters = counters;

      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: state as object },
      });

      try {
        await repo.persistExp021ActivePhaseMovementAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          validMovementDurationMs: movementMs,
        });

        const sealed = await repo.finalizeTerminalCalibrationAtomic(
          seed.organizationId,
          seed.sessionId,
          { terminalAtMs: phaseEndMs, reason: 'STOP' },
        );
        expect(sealed).not.toBeNull();

        const reloadedPrisma = new PrismaClient();
        const reloadedRepo = createRepository(reloadedPrisma);
        const session = await reloadedRepo.findById(seed.organizationId, seed.sessionId);
        const reloaded = parseAcquisitionState(session?.acquisitionStateJson);
        const summary = reloaded.hfCalibrationSeries?.completedPhaseSummaries?.[0];
        expect(summary?.validMovementDurationMs).toBe(movementMs);
        expect(summary?.validMovementDurationMs).not.toBe(0);

        await reloadedPrisma.$disconnect();
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    function buildKsMs661Phase120Summary(args: {
      vehicleId: string;
      tokenId: number;
      wallDurationMs: number;
    }): HfCalibrationPhaseSummary {
      const phaseEndMs = t0Ms + args.wallDurationMs;
      const counters = {
        ...emptyPhaseCounters('phase-120'),
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: 5,
      };
      return finalizePhaseSummary({
        phase: {
          calibrationPhaseId: 'phase-120',
          phaseSequence: 1,
          effectivePollIntervalMs: 120_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: new Date(phaseEndMs).toISOString(),
          phaseProvenance: 'PHYSICAL_T0',
          canonicalT0At: new Date(t0Ms).toISOString(),
          effectiveConfig: {
            calibrationSeriesId: 'series-v3',
            calibrationPhaseId: 'phase-120',
            phaseSequence: 1,
            vehicleId: args.vehicleId,
            tokenId: args.tokenId,
            effectivePollIntervalMs: 120_000,
            settlementDelayMs: 8000,
            recoveryOverlapMs: 6000,
            policyVersion: 'HF_RECOVERY_V2_2026-09-04',
            policyMode: 'V2' as const,
            effectiveAt: new Date(t0Ms).toISOString(),
          },
        },
        counters,
        phaseEndedAtMs: phaseEndMs,
        calibrationPlan: EXP021_CANDIDATE_BRACKET_V3,
      });
    }

    it('REALISTIC_POST_TRANSITION_LATE_MOVEMENT: 120s completed, 90s active, 90s counters', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix);
      const wallDurationMs = 612_400;
      const movementMs = 454_698;
      const phase120EndMs = t0Ms + wallDurationMs;
      const phase90StartMs = phase120EndMs;

      const completedPhase120 = {
        calibrationPhaseId: 'phase-120',
        phaseSequence: 1,
        effectivePollIntervalMs: 120_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(phase120EndMs).toISOString(),
        phaseProvenance: 'PHYSICAL_T0' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
      };
      const summary120 = buildKsMs661Phase120Summary({
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        wallDurationMs,
      });
      expect(summary120.scientificStatus).toBeNull();
      expect(summary120.providerRequestCount).toBe(5);
      expect(summary120.providerSuccessCount).toBe(5);

      const activePhase90 = {
        calibrationPhaseId: 'phase-90',
        phaseSequence: 2,
        effectivePollIntervalMs: 90_000,
        phaseStartedAt: new Date(phase90StartMs).toISOString(),
        phaseEndedAt: null,
        phaseProvenance: 'PHYSICAL_TRANSITION' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
        effectiveConfig: {
          calibrationSeriesId: 'series-v3',
          calibrationPhaseId: 'phase-90',
          phaseSequence: 2,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 90_000,
          settlementDelayMs: 8000,
          recoveryOverlapMs: 6000,
          policyVersion: 'HF_RECOVERY_V2_2026-09-04',
          policyMode: 'V2' as const,
          effectiveAt: new Date(phase90StartMs).toISOString(),
        },
      };
      const counters90 = buildInitialPhaseCounters({
        calibrationPhaseId: 'phase-90',
        phaseEffectiveStartMs: phase90StartMs,
        cadenceMs: 90_000,
        phaseProvenance: 'PHYSICAL_TRANSITION',
        calibrationPlan: EXP021_CANDIDATE_BRACKET_V3,
      });

      const state = emptyDataPlane(t0Ms);
      state.hfCalibrationSeries = {
        calibrationSeriesId: 'series-v3',
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        calibrationPlanId: 'candidate_bracket_v3',
        calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        phaseOrder: [120_000, 90_000],
        activePhase: activePhase90,
        completedPhases: [completedPhase120],
        completedPhaseSummaries: [summary120],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: null,
        lastPhaseBoundaryAt: new Date(phase120EndMs).toISOString(),
        seriesStartedAt: new Date(t0Ms).toISOString(),
        controlPlaneRevision: 2,
      };
      state.hfCalibrationActiveCounters = counters90;

      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: state as object },
      });

      try {
        await repo.persistExp021ActivePhaseMovementAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          calibrationPhaseId: 'phase-120',
          validMovementDurationMs: movementMs,
        });

        const session = await repo.findById(seed.organizationId, seed.sessionId);
        const reloaded = parseAcquisitionState(session?.acquisitionStateJson);
        const patched120 = reloaded.hfCalibrationSeries?.completedPhaseSummaries?.[0];
        expect(patched120?.providerRequestCount).toBe(5);
        expect(patched120?.providerSuccessCount).toBe(5);
        expect(patched120?.validMovementDurationMs).toBe(movementMs);
        expect(patched120?.scientificStatus).toBe('VALID');
        expect(patched120?.calibrationPlanVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');
        expect(patched120?.scientificStatus).not.toBe('DEGRADED_INSUFFICIENT_REQUESTS');

        const activeCounters = reloaded.hfCalibrationActiveCounters;
        expect(activeCounters?.calibrationPhaseId).toBe('phase-90');
        expect(activeCounters).toEqual(counters90);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REALISTIC_POST_TRANSITION_NULL_COUNTERS: recompute from summary evidence only', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix);
      const wallDurationMs = 612_400;
      const movementMs = 454_698;
      const phase120EndMs = t0Ms + wallDurationMs;

      const completedPhase120 = {
        calibrationPhaseId: 'phase-120',
        phaseSequence: 1,
        effectivePollIntervalMs: 120_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(phase120EndMs).toISOString(),
        phaseProvenance: 'PHYSICAL_T0' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
      };
      const summary120 = buildKsMs661Phase120Summary({
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        wallDurationMs,
      });

      const state = emptyDataPlane(t0Ms);
      state.hfCalibrationSeries = {
        calibrationSeriesId: 'series-v3',
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        calibrationPlanId: 'candidate_bracket_v3',
        calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        phaseOrder: [120_000],
        activePhase: null,
        completedPhases: [completedPhase120],
        completedPhaseSummaries: [summary120],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: new Date(phase120EndMs).toISOString(),
        lastPhaseBoundaryAt: new Date(phase120EndMs).toISOString(),
        seriesStartedAt: new Date(t0Ms).toISOString(),
        controlPlaneRevision: 1,
      };
      state.hfCalibrationActiveCounters = null;

      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: state as object },
      });

      try {
        await repo.persistExp021ActivePhaseMovementAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          calibrationPhaseId: 'phase-120',
          validMovementDurationMs: movementMs,
        });

        const session = await repo.findById(seed.organizationId, seed.sessionId);
        const reloaded = parseAcquisitionState(session?.acquisitionStateJson);
        const patched120 = reloaded.hfCalibrationSeries?.completedPhaseSummaries?.[0];
        expect(patched120?.providerRequestCount).toBe(5);
        expect(patched120?.providerSuccessCount).toBe(5);
        expect(patched120?.validMovementDurationMs).toBe(movementMs);
        expect(patched120?.scientificStatus).toBe('VALID');
        expect(reloaded.hfCalibrationActiveCounters).toBeNull();
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('LATE_MOVEMENT_RECOMPUTE: completed summary gets VALID after movement patch', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix);
      const wallDurationMs = 612_400;
      const movementMs = 454_698;
      const phaseEndMs = t0Ms + wallDurationMs;
      const counters = {
        ...emptyPhaseCounters('phase-120'),
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: 5,
      };
      const completedPhase = {
        calibrationPhaseId: 'phase-120',
        phaseSequence: 1,
        effectivePollIntervalMs: 120_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(phaseEndMs).toISOString(),
        phaseProvenance: 'PHYSICAL_T0' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
      };
      const summary = finalizePhaseSummary({
        phase: {
          ...completedPhase,
          effectiveConfig: {
            calibrationSeriesId: 'series-v3',
            calibrationPhaseId: 'phase-120',
            phaseSequence: 1,
            vehicleId: seed.vehicleId,
            tokenId: seed.tokenId,
            effectivePollIntervalMs: 120_000,
            settlementDelayMs: 8000,
            recoveryOverlapMs: 6000,
            policyVersion: 'HF_RECOVERY_V2_2026-09-04',
            policyMode: 'V2' as const,
            effectiveAt: new Date(t0Ms).toISOString(),
          },
        },
        counters,
        phaseEndedAtMs: phaseEndMs,
        calibrationPlan: EXP021_CANDIDATE_BRACKET_V3,
      });
      expect(summary.scientificStatus).toBeNull();

      const state = emptyDataPlane(t0Ms);
      state.hfCalibrationSeries = {
        calibrationSeriesId: 'series-v3',
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        calibrationPlanId: 'candidate_bracket_v3',
        calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        phaseOrder: [120_000],
        activePhase: null,
        completedPhases: [completedPhase],
        completedPhaseSummaries: [summary],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: new Date(phaseEndMs).toISOString(),
        lastPhaseBoundaryAt: new Date(phaseEndMs).toISOString(),
        seriesStartedAt: new Date(t0Ms).toISOString(),
        controlPlaneRevision: 1,
      };
      state.hfCalibrationActiveCounters = counters;

      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: state as object },
      });

      try {
        await repo.persistExp021ActivePhaseMovementAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          calibrationPhaseId: 'phase-120',
          validMovementDurationMs: movementMs,
        });

        const session = await repo.findById(seed.organizationId, seed.sessionId);
        const reloaded = parseAcquisitionState(session?.acquisitionStateJson);
        const patched = reloaded.hfCalibrationSeries?.completedPhaseSummaries?.[0];
        expect(patched?.validMovementDurationMs).toBe(movementMs);
        expect(patched?.scientificStatus).toBe('VALID');
        expect(patched?.calibrationPlanVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('EARLY_END_REALISTIC: 180/120 completed, 60 active at ~26.2min, 30 NOT_RUN', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix);
      const physicalEndMs = t0Ms + 26.2 * 60_000;
      const phase60StartMs = physicalEndMs - 60_000;
      const phase120StartMs = phase60StartMs - 10 * 60_000;
      const phase180EndMs = phase120StartMs;

      const completedPhase180 = {
        calibrationPhaseId: 'phase-180',
        phaseSequence: 1,
        effectivePollIntervalMs: 180_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(phase180EndMs).toISOString(),
        phaseProvenance: 'PHYSICAL_T0' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
      };
      const completedPhase120 = {
        calibrationPhaseId: 'phase-120',
        phaseSequence: 2,
        effectivePollIntervalMs: 120_000,
        phaseStartedAt: new Date(phase180EndMs).toISOString(),
        phaseEndedAt: new Date(phase120StartMs).toISOString(),
        phaseProvenance: 'PHYSICAL_TRANSITION' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
      };
      const summary180 = finalizePhaseSummary({
        phase: { ...completedPhase180, phaseEndedAt: completedPhase180.phaseEndedAt },
        counters: { ...emptyPhaseCounters('phase-180'), validMovementDurationMs: 600_000 },
        phaseEndedAtMs: phase180EndMs,
        calibrationPlan: EXP021_UPPER_BOUND_V2,
      });
      const summary120 = finalizePhaseSummary({
        phase: { ...completedPhase120, phaseEndedAt: completedPhase120.phaseEndedAt },
        counters: { ...emptyPhaseCounters('phase-120'), validMovementDurationMs: 400_000 },
        phaseEndedAtMs: phase120StartMs,
        calibrationPlan: EXP021_UPPER_BOUND_V2,
      });

      const state = emptyDataPlane(t0Ms);
      state.hfCalibrationSeries = {
        calibrationSeriesId: 'series',
        vehicleId: seed.vehicleId,
        tokenId: seed.tokenId,
        phaseOrder: [180_000, 120_000, 60_000, 30_000],
        activePhase: {
          calibrationPhaseId: 'phase-60',
          phaseSequence: 3,
          effectivePollIntervalMs: 60_000,
          phaseStartedAt: new Date(phase60StartMs).toISOString(),
          phaseEndedAt: null,
          phaseProvenance: 'PHYSICAL_TRANSITION',
          canonicalT0At: new Date(t0Ms).toISOString(),
        },
        completedPhases: [completedPhase180, completedPhase120],
        completedPhaseSummaries: [summary180, summary120],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: null,
        lastPhaseBoundaryAt: new Date(phase120StartMs).toISOString(),
        seriesStartedAt: new Date(t0Ms).toISOString(),
        controlPlaneRevision: 1,
      };
      state.hfCalibrationActiveCounters = emptyPhaseCounters('phase-60');

      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: state as object },
      });

      try {
        const updated = await repo.finalizePhysicalEndEarlyAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          physicalEndMs,
        });
        expect(updated).not.toBeNull();

        const reloaded = parseAcquisitionState(updated?.acquisitionStateJson);
        expect(reloaded.hfCalibrationSeries?.terminalFinalizationAt).toBe(
          new Date(physicalEndMs).toISOString(),
        );
        expect(reloaded.hfCalibrationSeries?.completedPhases.map((p) => p.effectivePollIntervalMs)).toEqual([
          180_000,
          120_000,
          60_000,
        ]);
        expect(reloaded.hfCalibrationSeries?.skippedPhasePlans?.map((p) => p.cadenceMs)).toEqual([30_000]);
        expect(
          reloaded.hfCalibrationSeries?.skippedPhasePlans?.every(
            (p) => p.skipReason === 'PHYSICAL_RUN_ENDED_EARLY',
          ),
        ).toBe(true);
        expect(reloaded.hfCalibrationSeries?.skippedPhasePlans?.some((p) => p.cadenceMs === 180_000)).toBe(
          false,
        );
        expect(reloaded.hfCalibrationSeries?.skippedPhasePlans?.some((p) => p.cadenceMs === 120_000)).toBe(
          false,
        );
        expect(reloaded.hfCalibrationActiveCounters).toBeNull();
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });
  },
);
