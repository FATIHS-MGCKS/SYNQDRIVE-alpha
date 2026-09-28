import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'crypto';
import { FuelType, PrismaClient, type RawRefuelCandidate } from '@prisma/client';
import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawRefuelPromotionService } from './raw-refuel-promotion.service';
import {
  buildKsMx20240916StaleBaselineCandidate,
  buildWob20260927EventBCandidate,
  buildWob20260927EventBSamples,
} from './testing/wob-2026-09-19-stretched-end.fixture';
import {
  buildKsMx20260916StalePre10Samples,
  buildKsMx20260916StalePre17Samples,
  buildKsMx20260916StalePre14Samples,
} from './testing/ks-mx-2026-09-16-baseline-recency.fixture';
import { RawRefuelCandidateRecoveryRepository } from '../raw-refuel-candidate/raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from '../raw-refuel-candidate/raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import {
  READY_EVIDENCE_REFRESH_META_KEY,
  readReadyEvidenceRefreshFromEvidenceMeta,
} from './raw-refuel-ready-evidence-refresh-metadata';
import { evaluateReadyCandidateRefreshRequirement } from './raw-refuel-ready-evidence-refresh.policy';
import { readBaselineRecencyFromEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import { detectRawFuelRisesForPersistedSignalChannel } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import { buildDetectorPhysicsContext } from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';
import { resolveRawFuelSignalTrust } from './raw-fuel-signal-trust.resolver';

const LIVE = process.env.RAW_REFUEL_READY_EVIDENCE_REFRESH_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

function withRecoveryEnv(): () => void {
  const prev = {
    master: process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    persist: process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    recovery: process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
    convergence: process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
    promotion: process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
  };
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
  process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV] = 'true';
  process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
  process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'true';
  return () => {
    for (const [key, val] of Object.entries({
      [RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV]: prev.master,
      [RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV]: prev.persist,
      [RFRF_CANDIDATE_RECOVERY_ENABLED_ENV]: prev.recovery,
      [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: prev.convergence,
      [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: prev.promotion,
    })) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  };
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: { companyName: `RFRF READY refresh ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `ready-refresh-${suffix}`,
      tokenId: 950000 + Math.floor(Math.random() * 10000),
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `RR${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `RR-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: FuelType.GASOLINE,
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle, dimoVehicleId: dimoVehicle.id };
}

async function cleanup(
  prisma: PrismaClient,
  vehicleId: string,
  orgId: string,
  dimoVehicleId: string,
) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.dimoVehicle.deleteMany({ where: { id: dimoVehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

function buildRecoveryStack(
  prisma: PrismaClient,
  samples: () => ReturnType<typeof buildWob20260927EventBSamples>,
  recoveryNow: () => Date,
) {
  let fetchCount = 0;
  const candidateService = RawRefuelCandidateService.withFixedClock(
    prisma as unknown as PrismaService,
    recoveryNow().toISOString(),
  );
  const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
  const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
  const recovery = new RawRefuelCandidateRecoveryService(
    prisma as unknown as PrismaService,
    candidateService,
    convergence,
    promotion,
  )
    .withSampleFetcher(async () => {
      fetchCount += 1;
      const raw = samples();
      return {
        status: 'OK' as const,
        samples: raw.map((s) => ({
          timestamp: s.timestamp,
          absoluteLiters: s.absoluteLiters ?? null,
          relativePercent: s.relativePercent ?? null,
        })),
      };
    })
    .withRecoveryClock(recoveryNow);
  return { recovery, getFetchCount: () => fetchCount };
}

async function seedLegacyEventBReady(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
): Promise<RawRefuelCandidate> {
  const row = buildWob20260927EventBCandidate({
    organizationId: orgId,
    vehicleId,
    id: randomUUID(),
    evidenceMeta: {},
    recoveryNextAttemptAt: new Date('2026-09-28T00:00:00.000Z'),
  });
  return prisma.rawRefuelCandidate.create({ data: row as never });
}

(LIVE ? describe : describe.skip)(
  'RFRF READY evidence refresh PostgreSQL (RAW_REFUEL_READY_EVIDENCE_REFRESH_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let restoreEnv: () => void;

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error('DATABASE_URL required for READY refresh integration');
      }
      prisma = new PrismaClient();
      restoreEnv = withRecoveryEnv();
    }, 60_000);

    afterAll(async () => {
      restoreEnv?.();
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('R1 — legacy READY missing metadata triggers refresh on recovery', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const now = new Date('2026-09-28T00:05:00.000Z');
      try {
        const candidate = await seedLegacyEventBReady(prisma, org.id, vehicle.id);
        expect(evaluateReadyCandidateRefreshRequirement(candidate).status).toBe('REFRESH_REQUIRED');
        const { recovery, getFetchCount } = buildRecoveryStack(
          prisma,
          buildWob20260927EventBSamples,
          () => now,
        );
        const result = await recovery.recoverCandidateById(candidate.id, now);
        expect(result.dimoFetchPerformed).toBe(true);
        expect(getFetchCount()).toBe(1);
        expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
        const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(readReadyEvidenceRefreshFromEvidenceMeta(row.evidenceMeta)).not.toBeNull();
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('R2/R3/R9 — Event-B-shaped refresh then idempotent second pass, trust blocks promotion', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const clockRef = { now: new Date('2026-09-28T00:10:00.000Z') };
      try {
        const candidate = await seedLegacyEventBReady(prisma, org.id, vehicle.id);
        const { recovery, getFetchCount } = buildRecoveryStack(
          prisma,
          buildWob20260927EventBSamples,
          () => clockRef.now,
        );
        const run1 = await recovery.recoverCandidateById(candidate.id, clockRef.now);
        expect(run1.dimoFetchPerformed).toBe(true);
        expect(getFetchCount()).toBe(1);
        const after1 = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(readBaselineRecencyFromEvidenceMeta(after1.evidenceMeta)).toBe('FRESH');
        expect(after1.absoluteSignalTrust).toBe('UNKNOWN');
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
        expect(evaluateReadyCandidateRefreshRequirement(after1).status).toBe('REFRESH_CURRENT');

        clockRef.now = new Date(clockRef.now.getTime() + 60_000);
        const run2 = await recovery.recoverCandidateById(candidate.id, clockRef.now);
        expect(run2.dimoFetchPerformed).toBe(false);
        expect(getFetchCount()).toBe(1);
        expect(run2.outcome).not.toBe('SUCCESS_PROMOTED');
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('R4 — stale baseline legacy READY cannot promote after refresh', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const now = new Date('2026-09-28T01:00:00.000Z');
      try {
        const stale = buildKsMx20240916StaleBaselineCandidate({
          organizationId: org.id,
          vehicleId: vehicle.id,
          id: randomUUID(),
        });
        await prisma.rawRefuelCandidate.create({ data: stale as never });
        const { recovery } = buildRecoveryStack(
          prisma,
          buildKsMx20260916StalePre10Samples,
          () => now,
        );
        const result = await recovery.recoverCandidateById(stale.id, now);
        expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('R5 — no matching observation blocks promotion', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const now = new Date('2026-09-28T02:00:00.000Z');
      try {
        const candidate = await seedLegacyEventBReady(prisma, org.id, vehicle.id);
        const { recovery } = buildRecoveryStack(prisma, () => [], () => now);
        const result = await recovery.recoverCandidateById(candidate.id, now);
        expect(result.outcome).toBe('NO_MATCHING_OBSERVATION');
        expect(
          await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } }),
        ).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('R6 — ambiguous observation blocks promotion (contract via matcher)', () => {
      const candidate = buildWob20260927EventBCandidate();
      const samples = buildWob20260927EventBSamples();
      const windowStart = candidate.scanWindowStart!;
      const windowEnd = candidate.scanWindowEnd!;
      const trust = resolveRawFuelSignalTrust({
        samples,
        scanWindowStart: windowStart,
        scanWindowEnd: windowEnd,
        fuelType: FuelType.GASOLINE,
      });
      const detection = detectRawFuelRisesForPersistedSignalChannel(
        {
          context: buildDetectorPhysicsContext({
            organizationId: candidate.organizationId,
            vehicleId: candidate.vehicleId,
            scanWindowStart: windowStart,
            scanWindowEnd: windowEnd,
            absoluteSignalTrust: trust.absoluteSignalTrust,
            absoluteDetectionAdmissibility: trust.absoluteDetectionAdmissibility,
            relativeSignalAvailable: trust.relativeSignalAvailable,
          }),
          samples,
        },
        candidate.signalChannel,
      );
      const obs = detection.candidates[0];
      const { selectRecoverySameObservation } = require('../raw-refuel-candidate/raw-refuel-candidate-recovery.service') as typeof import('../raw-refuel-candidate/raw-refuel-candidate-recovery.service');
      expect(selectRecoverySameObservation(candidate, [obs, obs]).kind).toBe('AMBIGUOUS');
    });

    it('R8 — stale lease prevents refresh mutation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const t0 = new Date('2026-09-28T03:00:00.000Z');
      const clockRef = { now: t0 };
      try {
        const candidate = await seedLegacyEventBReady(prisma, org.id, vehicle.id);
        const candidateService = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          t0.toISOString(),
        );
        const convergence = new RawRefuelConvergenceService(prisma as unknown as PrismaService);
        const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
        const originalReconcile =
          candidateService.reconcileExistingCandidateByIdForRecoveryClaim.bind(candidateService);
        candidateService.reconcileExistingCandidateByIdForRecoveryClaim = async (...args) => {
          clockRef.now = new Date(t0.getTime() + 10_000);
          return originalReconcile(...args);
        };
        const recovery = new RawRefuelCandidateRecoveryService(
          prisma as unknown as PrismaService,
          candidateService,
          convergence,
          promotion,
        )
          .withLeaseMs(2_000)
          .withRecoveryClock(() => clockRef.now)
          .withSampleFetcher(async () => ({
            status: 'OK' as const,
            samples: buildWob20260927EventBSamples().map((s) => ({
              timestamp: s.timestamp,
              absoluteLiters: s.absoluteLiters ?? null,
              relativePercent: s.relativePercent ?? null,
            })),
          }));
        const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
        await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 2_000));
        const result = await recovery.recoverCandidateById(candidate.id, t0);
        expect(result.detail).toBe('stale_claim');
        const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        expect(readReadyEvidenceRefreshFromEvidenceMeta(row.evidenceMeta)).toBeNull();
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('R12 — concurrent workers produce one authoritative row and zero fallback VEE', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const t0 = new Date('2026-09-28T04:00:00.000Z');
      try {
        const candidate = await seedLegacyEventBReady(prisma, org.id, vehicle.id);
        await prisma.rawRefuelCandidate.update({
          where: { id: candidate.id },
          data: { recoveryNextAttemptAt: t0 },
        });
        const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
        const leaseEnd = new Date(t0.getTime() + 60_000);
        const claimed = await repo.claimDueCandidates(2, t0, leaseEnd);
        expect(claimed.length).toBeGreaterThanOrEqual(1);

        const buildOne = () =>
          new RawRefuelCandidateRecoveryService(
            prisma as unknown as PrismaService,
            RawRefuelCandidateService.withFixedClock(
              prisma as unknown as PrismaService,
              t0.toISOString(),
            ),
            new RawRefuelConvergenceService(prisma as unknown as PrismaService),
            new RawRefuelPromotionService(prisma as unknown as PrismaService),
          )
            .withRecoveryClock(() => t0)
            .withSampleFetcher(async () => ({
              status: 'OK' as const,
              samples: buildWob20260927EventBSamples().map((s) => ({
                timestamp: s.timestamp,
                absoluteLiters: s.absoluteLiters ?? null,
                relativePercent: s.relativePercent ?? null,
              })),
            }));

        const [a, b] = await Promise.all([
          buildOne().recoverCandidateById(candidate.id, t0),
          buildOne().recoverCandidateById(candidate.id, t0),
        ]);
        expect([a.detail, b.detail].some((d) => d === 'stale_claim')).toBe(true);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });

    it('KS MX legacy READY refresh does not promote false stale deltas', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
      const now = new Date('2026-09-28T05:00:00.000Z');
      const cases = [
        { label: 'pre10', samples: buildKsMx20260916StalePre10Samples },
        { label: 'pre17', samples: buildKsMx20260916StalePre17Samples },
        { label: 'pre14', samples: buildKsMx20260916StalePre14Samples },
      ];
      try {
        for (const c of cases) {
          const stale = buildKsMx20240916StaleBaselineCandidate({
            organizationId: org.id,
            vehicleId: vehicle.id,
            id: randomUUID(),
          });
          await prisma.rawRefuelCandidate.create({ data: stale as never });
          const { recovery } = buildRecoveryStack(prisma, c.samples, () => now);
          const result = await recovery.recoverCandidateById(stale.id, now);
          expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
          await prisma.rawRefuelCandidate.delete({ where: { id: stale.id } });
        }
        expect(
          await prisma.vehicleEnergyEvent.count({
            where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
          }),
        ).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
      }
    });
  },
);

describe('Event B detector replay (unit, read-only DIMO-shaped fixture)', () => {
  it('matches same physical observation with current detector and UNKNOWN trust', () => {
    const samples = buildWob20260927EventBSamples();
    const candidate = buildWob20260927EventBCandidate();
    const windowStart = candidate.scanWindowStart!;
    const windowEnd = candidate.scanWindowEnd!;
    const trust = resolveRawFuelSignalTrust({
      samples,
      scanWindowStart: windowStart,
      scanWindowEnd: windowEnd,
      fuelType: FuelType.GASOLINE,
    });
    expect(trust.absoluteSignalTrust).toBe('UNKNOWN');
    const detection = detectRawFuelRisesForPersistedSignalChannel(
      {
        context: buildDetectorPhysicsContext({
          organizationId: candidate.organizationId,
          vehicleId: candidate.vehicleId,
          scanWindowStart: windowStart,
          scanWindowEnd: windowEnd,
          absoluteSignalTrust: trust.absoluteSignalTrust,
          absoluteDetectionAdmissibility: trust.absoluteDetectionAdmissibility,
          relativeSignalAvailable: trust.relativeSignalAvailable,
        }),
        samples,
      },
      candidate.signalChannel,
    );
    expect(detection.candidates.length).toBeGreaterThanOrEqual(1);
    const obs = detection.candidates[0];
    expect(obs.preFuelAbsoluteLiters).toBe(4);
    expect(obs.postFuelAbsoluteLiters).toBe(13);
    expect(obs.deltaAbsoluteLiters).toBe(9);
    expect(readBaselineRecencyFromEvidenceMeta(obs.evidenceMeta)).toBe('FRESH');
  });
});

describe('READY refresh metadata durability contract', () => {
  it('does not store wall-clock-only refresh timestamps in readyEvidenceRefresh', () => {
    const metaPath = join(__dirname, 'raw-refuel-ready-evidence-refresh-metadata.ts');
    const src = readFileSync(metaPath, 'utf8');
    expect(src).toContain(READY_EVIDENCE_REFRESH_META_KEY);
    expect(src).not.toMatch(/readyEvidenceRefresh[\s\S]*Date\.now/);
  });
});
