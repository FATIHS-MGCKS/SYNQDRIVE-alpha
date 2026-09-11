/**
 * EXP-021 — real PostgreSQL T0 durability + physical phase recovery integration.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { switchHfCalibrationPhase } from './reference-capture-hf-calibration-phase.policy';
import {
  Exp021T0ConsistencyError,
  parseExp021PhysicalAuthority,
} from './reference-capture-exp-021-physical-authority.lib';
import {
  activatePendingPhaseAtBoundary,
  buildReferenceCapturePostgresDatabaseUrl,
  cleanupReferenceCaptureSeed,
  createRepository,
  defaultV2Policy,
  emptyDataPlane,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
  seedRecordingSession,
} from './testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'EXP-021 T0 recovery PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let repo: ReturnType<typeof createRepository>;
    const hfPolicy = defaultV2Policy();
    const t0Ms = Date.parse('2026-09-10T05:42:11.000Z');

    beforeAll(async () => {
      process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
      proveIsolatedReferenceCapturePostgres();
      const ok = await probeReferenceCapturePostgresDatabase();
      if (!ok) {
        throw new Error(
          'REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1 requires isolated Postgres with reference_capture_sessions (LOCAL_SKIP: database unreachable)',
        );
      }
      prisma = new PrismaClient();
      repo = createRepository(prisma);
    }, 120_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('REAL_DB_T0_RECOVERY: persist T0 then activate from persisted authority only', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      const preRollSeries = switchHfCalibrationPhase({
        existing: null,
        vehicleId: seed.vehicleId,
        tokenId: 187_361,
        effectivePollIntervalMs: 60_000,
        nowMs: t0Ms - 35 * 60_000,
        phaseProvenance: 'PRE_ROLL',
      }).series;
      const acquisitionState = emptyDataPlane(t0Ms - 35 * 60_000);
      acquisitionState.hfCalibrationSeries = preRollSeries;
      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: acquisitionState as object },
      });

      try {
        const firstQualifyingMovementAt = new Date(t0Ms);
        const startConfirmedAt = new Date(t0Ms + 1_000);
        const persisted = await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt,
          startConfirmedAt,
          nowMs: t0Ms + 1_000,
        });
        expect(persisted?.created).toBe(true);

        const activated = await repo.activatePhysicalPhaseAtT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 60_000,
          hfPolicy,
          nowMs: t0Ms + 2_000,
        });
        expect(activated?.canonicalT0At).toBe(firstQualifyingMovementAt.toISOString());
        expect(activated?.activePhase.phaseProvenance).toBe('PHYSICAL_T0');
        expect(activated?.reanchored).toBe(true);

        const restarted = await repo.activatePhysicalPhaseAtT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 60_000,
          hfPolicy,
          nowMs: t0Ms + 3_000,
        });
        expect(restarted?.reanchored).toBe(false);
        expect(restarted?.activePhase.calibrationPhaseId).toBe(
          activated?.activePhase.calibrationPhaseId,
        );
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_DB_T0_RECOVERY: crash-after-T0 simulation activates same T0 without caller override', async () => {
      const suffix = randomUUID().slice(0, 8);
      const preRollSeries = switchHfCalibrationPhase({
        existing: null,
        vehicleId: randomUUID(),
        tokenId: 187_361,
        effectivePollIntervalMs: 60_000,
        nowMs: t0Ms - 20 * 60_000,
        phaseProvenance: 'PRE_ROLL',
      }).series;
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      const acquisitionState = emptyDataPlane(t0Ms - 20 * 60_000);
      acquisitionState.hfCalibrationSeries = {
        ...preRollSeries,
        vehicleId: seed.vehicleId,
        tokenId: 187_361,
      };
      await prisma.referenceCaptureSession.update({
        where: { id: seed.sessionId },
        data: { acquisitionStateJson: acquisitionState as object },
      });

      try {
        const canonicalT0 = new Date(t0Ms);
        await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: canonicalT0,
          startConfirmedAt: new Date(t0Ms + 500),
          nowMs: t0Ms + 500,
        });

        const afterCrash = await repo.activatePhysicalPhaseAtT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 60_000,
          hfPolicy,
          nowMs: t0Ms + 60_000,
        });
        expect(afterCrash?.canonicalT0At).toBe(canonicalT0.toISOString());
        const authority = parseExp021PhysicalAuthority(afterCrash?.session.preflightJson);
        expect(authority?.canonicalT0At).toBe(canonicalT0.toISOString());
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_DB_T0_RECOVERY: conflicting candidate T0 fails closed', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      const canonicalT0 = new Date(t0Ms);
      try {
        await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: canonicalT0,
          startConfirmedAt: new Date(t0Ms + 500),
          nowMs: t0Ms + 500,
        });

        await expect(
          repo.persistExp021CanonicalT0Atomic({
            organizationId: seed.organizationId,
            sessionId: seed.sessionId,
            firstQualifyingMovementAt: new Date(t0Ms + 60_000),
            startConfirmedAt: new Date(t0Ms + 61_000),
            nowMs: t0Ms + 61_000,
          }),
        ).rejects.toBeInstanceOf(Exp021T0ConsistencyError);
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });

    it('REAL_RESTART_RECOVERY: PHYSICAL_TRANSITION restart remains idempotent at same T0', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedRecordingSession(prisma, suffix, { tokenId: 187_361 });
      try {
        const canonicalT0 = new Date(t0Ms);
        await repo.persistExp021CanonicalT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          firstQualifyingMovementAt: canonicalT0,
          startConfirmedAt: new Date(t0Ms + 500),
          nowMs: t0Ms + 500,
        });
        const phase60 = await repo.activatePhysicalPhaseAtT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 60_000,
          hfPolicy,
          nowMs: t0Ms + 2_000,
        });
        expect(phase60).not.toBeNull();

        await repo.requestHfCalibrationPhaseAtomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 30_000,
          nowMs: t0Ms + 70_000,
          phaseProvenance: 'PHYSICAL_TRANSITION',
        });
        const transitioned = await activatePendingPhaseAtBoundary(
          repo,
          seed.organizationId,
          seed.sessionId,
          hfPolicy,
          t0Ms + 70_000,
        );
        const active = (transitioned.acquisitionStateJson as { hfCalibrationSeries?: { activePhase?: { phaseProvenance?: string } } })
          .hfCalibrationSeries?.activePhase;
        expect(active?.phaseProvenance).toBe('PHYSICAL_TRANSITION');

        const restarted = await repo.activatePhysicalPhaseAtT0Atomic({
          organizationId: seed.organizationId,
          sessionId: seed.sessionId,
          vehicleId: seed.vehicleId,
          tokenId: seed.tokenId,
          effectivePollIntervalMs: 60_000,
          hfPolicy,
          nowMs: t0Ms + 80_000,
        });
        expect(restarted?.reanchored).toBe(false);
        expect(restarted?.activePhase.phaseProvenance).toBe('PHYSICAL_TRANSITION');
      } finally {
        await cleanupReferenceCaptureSeed(prisma, seed);
      }
    });
  },
);
