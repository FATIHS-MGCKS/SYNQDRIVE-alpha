import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import { pilotFreshL3Triple } from '../../core/__tests__/fixtures/wob-pilot-golden.fixture';
import { presentObs } from '../../core/__tests__/test-helpers';
import { DiV0ShadowPersistenceRepository } from '../di-v0-shadow-persistence.repository';
import { DiV0ShadowPersistenceService } from '../di-v0-shadow-persistence.service';
import {
  assertShadowPostgresIntegrationReady,
  cleanupShadowTripFixtures,
  seedShadowTripFixtures,
} from './di-v0-shadow-postgres-harness';
import { PrismaService } from '@shared/database/prisma.service';

const LIVE = process.env.DI_V0_SHADOW_PERSISTENCE_INTEGRATION === '1';

function validIdentity(orgId: string, vehicleId: string, tripId: string) {
  return {
    organizationId: orgId,
    vehicleId,
    tripId,
    sourceFamily: 'RUPTELA_R1' as const,
    versions: DEFAULT_DI_V0_VERSION_TUPLE,
    inputEvidenceVersion: 'tenant-matrix',
  };
}

(LIVE ? describe : describe.skip)(
  'DI V0 shadow hardening (DI_V0_SHADOW_PERSISTENCE_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let repository: DiV0ShadowPersistenceRepository;
    let service: DiV0ShadowPersistenceService;

    beforeAll(async () => {
      prisma = new PrismaClient();
      await assertShadowPostgresIntegrationReady(prisma);
      const prismaService = prisma as unknown as PrismaService;
      repository = new DiV0ShadowPersistenceRepository(prismaService);
      service = new DiV0ShadowPersistenceService(repository, prismaService);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('rejects cross-tenant org with foreign vehicle/trip', async () => {
      const a = await seedShadowTripFixtures(prisma);
      const b = await seedShadowTripFixtures(prisma);
      await expect(
        repository.createOrGetRun({
          ...validIdentity(a.org.id, b.vehicle.id, b.trip.id),
          inputEvidenceVersion: 'cross-org',
        }),
      ).rejects.toThrow(/TRIP_IDENTITY_MISMATCH/);
      expect(await prisma.diV0ShadowRun.count({ where: { tripId: b.trip.id } })).toBe(0);
      await cleanupShadowTripFixtures(prisma, a.trip.id, a.vehicle.id, a.org.id);
      await cleanupShadowTripFixtures(prisma, b.trip.id, b.vehicle.id, b.org.id);
    });

    it('rejects wrong vehicle for trip', async () => {
      const a = await seedShadowTripFixtures(prisma);
      const b = await seedShadowTripFixtures(prisma);
      await expect(
        repository.createOrGetRun({
          ...validIdentity(a.org.id, a.vehicle.id, b.trip.id),
          inputEvidenceVersion: 'wrong-vehicle',
        }),
      ).rejects.toThrow(/TRIP_IDENTITY_MISMATCH/);
      await cleanupShadowTripFixtures(prisma, a.trip.id, a.vehicle.id, a.org.id);
      await cleanupShadowTripFixtures(prisma, b.trip.id, b.vehicle.id, b.org.id);
    });

    it('completion summary derived from DB intervals (caller cannot lie)', async () => {
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      const run = await repository.createOrGetRun({
        ...validIdentity(org.id, vehicle.id, trip.id),
        inputEvidenceVersion: 'lie-summary',
      });
      await repository.markRunRunning(run.id);
      const baseStart = new Date('2026-01-01T10:00:00.000Z');
      const row = {
        intervalStart: baseStart,
        intervalEnd: new Date('2026-01-01T10:00:01.000Z'),
        referenceTime: baseStart,
        motionState: 'NO_MOTION_EVIDENCE' as const,
        positionState: 'ROW_ABSENT' as const,
        causalPositionState: 'ROW_ABSENT' as const,
        estimatedSpeedKmh: null,
        speedRangeMinKmh: null,
        speedRangeMaxKmh: null,
        speedEvidenceState: null,
        temporalConfidence: 'UNKNOWN' as const,
        valueConfidence: 'UNAVAILABLE' as const,
        sourceRelation: 'UNASSESSABLE' as const,
        claimLevel: 'L0' as const,
        abstentionReason: null,
        derivationMethod: 'NONE' as const,
        derivationVersion: 'v0',
        evidenceSources: [],
        sourceQualityFlags: [],
        supportIntervalStart: null,
        supportIntervalEnd: null,
        provenance: { test: true },
      };
      await repository.insertIntervalBatch(run, [row], DEFAULT_DI_V0_VERSION_TUPLE);
      const completed = await repository.completeRun(run.id);
      expect(completed.numericSpeedCount).toBe(0);
      expect(completed.intervalCount).toBe(1);
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    });

    it('forbids COMPLETED -> RUNNING', async () => {
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      const output = computeDiV0TripIntervals(
        { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const run = await service.persistCompletedRun({
        identity: { ...validIdentity(org.id, vehicle.id, trip.id), inputEvidenceVersion: 'completed-guard' },
        computeOutput: output,
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
      });
      expect(run.status).toBe('COMPLETED');
      await expect(repository.markRunRunning(run.id)).rejects.toThrow(/ILLEGAL_RUN_STATUS_TRANSITION/);
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    });

    it('raw SQL invalid status rejected by DB CHECK', async () => {
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO di_v0_shadow_runs (id, organization_id, vehicle_id, trip_id, source_family, structural_version, estimator_version, calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, status, updated_at)
           VALUES ($1,$2,$3,$4,'RUPTELA_R1','s','e','c','p','iev',$5,'NOT_A_STATUS',NOW())`,
          randomUUID(),
          org.id,
          vehicle.id,
          trip.id,
          randomUUID(),
        ),
      ).rejects.toThrow();
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    });

    it('raw SQL invalid interval order rejected by DB CHECK', async () => {
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      const run = await repository.createOrGetRun({
        ...validIdentity(org.id, vehicle.id, trip.id),
        inputEvidenceVersion: 'sql-order',
      });
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO di_v0_shadow_intervals (id, shadow_run_id, organization_id, vehicle_id, trip_id, interval_start, interval_end, reference_time, motion_state, position_state, causal_position_state, temporal_confidence, value_confidence, source_relation, claim_level, derivation_method, derivation_version, structural_version, estimator_version, calibration_version, source_family_policy_version, provenance)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NO_MOTION_EVIDENCE','ROW_ABSENT','ROW_ABSENT','UNKNOWN','UNAVAILABLE','UNASSESSABLE','L0','NONE','v0','s','e','c','p','{}'::jsonb)`,
          randomUUID(),
          run.id,
          org.id,
          vehicle.id,
          trip.id,
          new Date('2026-01-02T00:00:00Z'),
          new Date('2026-01-01T00:00:00Z'),
          new Date('2026-01-01T12:00:00Z'),
        ),
      ).rejects.toThrow();
      await repository.deleteRunForTest(run.id);
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    });

    it('concurrent run create and completion stay consistent', async () => {
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      const identity = { ...validIdentity(org.id, vehicle.id, trip.id), inputEvidenceVersion: 'conc' };
      const output = computeDiV0TripIntervals(
        { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const rows = output.intervals.length;
      const [r1, r2] = await Promise.all([
        service.persistCompletedRun({ identity, computeOutput: output, versions: DEFAULT_DI_V0_VERSION_TUPLE }),
        service.persistCompletedRun({ identity, computeOutput: output, versions: DEFAULT_DI_V0_VERSION_TUPLE }),
      ]);
      expect(r1.id).toBe(r2.id);
      expect(r1.status).toBe('COMPLETED');
      expect(await prisma.diV0ShadowInterval.count({ where: { shadowRunId: r1.id } })).toBe(rows);
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    });

    it('transaction rollback on injected batch failure leaves no intervals', async () => {
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      const identity = { ...validIdentity(org.id, vehicle.id, trip.id), inputEvidenceVersion: 'tx-rollback' };
      const output = computeDiV0TripIntervals(
        { sourceFamily: 'RUPTELA_R1', positions: pilotFreshL3Triple() },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const run = await repository.createOrGetRun(identity);
      const spy = jest
        .spyOn(repository, 'insertIntervalBatch')
        .mockRejectedValueOnce(new Error('INJECTED_BATCH_FAILURE'));
      await expect(
        service.persistCompletedRun({ identity, computeOutput: output, versions: DEFAULT_DI_V0_VERSION_TUPLE }),
      ).rejects.toThrow(/INJECTED_BATCH_FAILURE/);
      spy.mockRestore();
      const after = await prisma.diV0ShadowRun.findUnique({ where: { id: run.id } });
      expect(after?.status).not.toBe('COMPLETED');
      expect(await prisma.diV0ShadowInterval.count({ where: { shadowRunId: run.id } })).toBe(0);
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    });

    it('performance: 28800 intervals when DI_V0_SHADOW_PERF_28800=1', async () => {
      if (process.env.DI_V0_SHADOW_PERF_28800 !== '1') {
        return;
      }
      const { org, vehicle, trip } = await seedShadowTripFixtures(prisma);
      const positions = [];
      for (let i = 0; i < 28800; i++) {
        const label = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z');
        positions.push(presentObs(label, 52 + i * 0.000001, 9));
      }
      const output = computeDiV0TripIntervals(
        { sourceFamily: 'API_SYNTHETIC', positions },
        { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
      );
      const t0 = performance.now();
      const run = await service.persistCompletedRun({
        identity: {
          ...validIdentity(org.id, vehicle.id, trip.id),
          sourceFamily: 'API_SYNTHETIC',
          inputEvidenceVersion: 'perf-28800',
        },
        computeOutput: output,
        versions: DEFAULT_DI_V0_VERSION_TUPLE,
      });
      const elapsed = performance.now() - t0;
      expect(run.intervalCount).toBe(28800);
      expect(elapsed).toBeLessThan(180_000);
      await cleanupShadowTripFixtures(prisma, trip.id, vehicle.id, org.id);
    }, 200_000);
  },
);
