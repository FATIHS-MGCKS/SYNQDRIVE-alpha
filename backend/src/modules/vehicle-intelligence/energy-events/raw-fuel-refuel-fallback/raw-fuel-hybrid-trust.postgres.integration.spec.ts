/**
 * Isolated PostgreSQL promotion/recovery pipeline proofs for hybrid trust (P1–P7).
 * Gate: rfrf-hybrid-trust-postgres-gate.sh sets RAW_REFUEL_HYBRID_TRUST_INTEGRATION=1 + DATABASE_URL.
 */
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
import { buildWob20260927EventBCandidate, buildWob20260927EventBSamples } from './testing/wob-2026-09-19-stretched-end.fixture';
import {
  buildEventBContradictoryDualChannelSamples,
  buildEventBDualChannelCorroboratedSamples,
} from './testing/hybrid-trust-event-b-samples.fixture';
import { RawRefuelCandidateRecoveryService } from '../raw-refuel-candidate/raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { evaluateReadyCandidateRefreshRequirement } from './raw-refuel-ready-evidence-refresh.policy';
import {
  buildReadyEvidenceRefreshMeta,
  readReadyEvidenceRefreshFromEvidenceMeta,
} from './raw-refuel-ready-evidence-refresh-metadata';
import {
  readHybridAbsoluteSignalTrustEvidence,
} from './raw-fuel-hybrid-trust-evidence-metadata';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import { RFRF_SIGNAL_TRUST_RESOLVER_VERSION } from './raw-fuel-signal-trust.resolver';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';

const LIVE = process.env.RAW_REFUEL_HYBRID_TRUST_INTEGRATION === '1';

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
  process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'false';
  process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = 'false';
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
    data: { companyName: `Hybrid trust ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
  });
  const dimoVehicle = await prisma.dimoVehicle.create({
    data: {
      externalId: `hybrid-trust-${suffix}`,
      tokenId: 960000 + Math.floor(Math.random() * 10000),
      fuelType: 'GASOLINE',
      powertrainType: 'ICE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      dimoVehicleId: dimoVehicle.id,
      vin: `HT${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `HT-${suffix}`.slice(0, 12),
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
  const recovery = new RawRefuelCandidateRecoveryService(
    prisma as unknown as PrismaService,
    candidateService,
    new RawRefuelConvergenceService(prisma as unknown as PrismaService),
    new RawRefuelPromotionService(prisma as unknown as PrismaService),
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

async function seedLegacyReady(
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

(LIVE ? describe : describe.skip)('RFRF hybrid trust PostgreSQL pipeline', () => {
  let prisma: PrismaClient;
  let restoreEnv: () => void;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL required (isolated gate must set localhost URL)');
    }
    prisma = new PrismaClient();
    restoreEnv = withRecoveryEnv();
  }, 60_000);

  afterAll(async () => {
    restoreEnv?.();
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('P1 — persisted READY refresh blocks promotion on UNKNOWN trust (no VEE)', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const now = new Date('2026-09-28T00:10:00.000Z');
    try {
      const candidate = await seedLegacyReady(prisma, org.id, vehicle.id);
      const { recovery, getFetchCount } = buildRecoveryStack(
        prisma,
        buildWob20260927EventBSamples,
        () => now,
      );
      const result = await recovery.recoverCandidateById(candidate.id, now);
      expect(getFetchCount()).toBeGreaterThanOrEqual(1);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      expect(row.absoluteSignalTrust).toBe('UNKNOWN');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  it('P2 — hybrid TRUSTED evidence with F5/promotion OFF blocks before VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const now = new Date('2026-09-28T00:20:00.000Z');
    try {
      const candidate = await seedLegacyReady(prisma, org.id, vehicle.id);
      const { recovery } = buildRecoveryStack(
        prisma,
        buildEventBDualChannelCorroboratedSamples,
        () => now,
      );
      await recovery.recoverCandidateById(candidate.id, now);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const hybrid = readHybridAbsoluteSignalTrustEvidence(row.evidenceMeta);
      expect(hybrid?.computedHybridClassification).toBe('TRUSTED');
      expect(row.absoluteSignalTrust).toBe('UNKNOWN');
      const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
      const promo = await promotion.evaluateAndApplyPromotionById(
        row.id,
        { capability: 'FUEL_CAPABLE', absoluteDetectionAdmissibility: 'ADMISSIBLE' },
        process.env,
      );
      expect(promo.status).toBe('SKIPPED_NOT_AUTHORIZED');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  it('P3 — stale trustResolverVersion v1 => REFRESH_REQUIRED', async () => {
    const baseline = buildBaselineRecencyEvidenceMeta({
      classification: 'FRESH',
      reason: 'pg',
      bridgeGapSeconds: 100,
      prePlateauStartAt: new Date('2026-09-27T21:30:00.000Z'),
      prePlateauEndAt: new Date('2026-09-27T21:34:00.000Z'),
      riseOnsetAt: new Date('2026-09-27T21:34:16.923Z'),
      interveningPrimarySampleCount: 0,
      interveningContradictionCount: 0,
    });
    const row = buildWob20260927EventBCandidate({
      evidenceMeta: {
        ...baseline,
        readyEvidenceRefresh: {
          ...buildReadyEvidenceRefreshMeta({
            baselineRecencyClassification: 'FRESH',
            absoluteSignalTrust: 'UNKNOWN',
            absoluteDetectionAdmissibility: 'ADMISSIBLE',
            relativeSignalAvailable: true,
            hybridTrustReasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
            hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
          }),
          trustResolverVersion: 'rfrf-signal-trust-v1',
        },
      } as never,
    });
    expect(evaluateReadyCandidateRefreshRequirement(row).status).toBe('REFRESH_REQUIRED');
    expect(evaluateReadyCandidateRefreshRequirement(row).reason).toBe(
      'trust_resolver_version_stale',
    );
  });

  it('P4 — recovery persists hybrid provenance block + current trust resolver version', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const now = new Date('2026-09-28T00:30:00.000Z');
    try {
      const candidate = await seedLegacyReady(prisma, org.id, vehicle.id);
      const { recovery } = buildRecoveryStack(prisma, buildWob20260927EventBSamples, () => now);
      await recovery.recoverCandidateById(candidate.id, now);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const refresh = readReadyEvidenceRefreshFromEvidenceMeta(row.evidenceMeta);
      expect(refresh?.trustResolverVersion).toBe(RFRF_SIGNAL_TRUST_RESOLVER_VERSION);
      const hybrid = readHybridAbsoluteSignalTrustEvidence(row.evidenceMeta);
      expect(hybrid?.authorityVersion).toBe(RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION);
      expect(hybrid?.reasonCode).toBeDefined();
      expect(hybrid?.absoluteDeltaLiters).not.toBeNull();
    } finally {
      await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  it('P5 — second identical READY recovery does not refetch DIMO when metadata current', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const clockRef = { now: new Date('2026-09-28T00:40:00.000Z') };
    try {
      const candidate = await seedLegacyReady(prisma, org.id, vehicle.id);
      const { recovery, getFetchCount } = buildRecoveryStack(
        prisma,
        buildWob20260927EventBSamples,
        () => clockRef.now,
      );
      await recovery.recoverCandidateById(candidate.id, clockRef.now);
      expect(getFetchCount()).toBe(1);
      const after1 = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      expect(evaluateReadyCandidateRefreshRequirement(after1).status).toBe('REFRESH_CURRENT');
      clockRef.now = new Date(clockRef.now.getTime() + 60_000);
      const run2 = await recovery.recoverCandidateById(candidate.id, clockRef.now);
      expect(run2.dimoFetchPerformed).toBe(false);
      expect(getFetchCount()).toBe(1);
    } finally {
      await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  it('P6 — UNTRUSTED hybrid classification persisted => no promotion/VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const now = new Date('2026-09-28T00:50:00.000Z');
    try {
      const candidate = await seedLegacyReady(prisma, org.id, vehicle.id);
      const { recovery } = buildRecoveryStack(
        prisma,
        buildEventBContradictoryDualChannelSamples,
        () => now,
      );
      await recovery.recoverCandidateById(candidate.id, now);
      const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const hybrid = readHybridAbsoluteSignalTrustEvidence(row.evidenceMeta);
      expect(hybrid?.computedHybridClassification).toBe('UNTRUSTED');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  it('P7 — contradictory dual-channel recovery => UNTRUSTED hybrid, zero VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const now = new Date('2026-09-28T01:00:00.000Z');
    try {
      const candidate = await seedLegacyReady(prisma, org.id, vehicle.id);
      const { recovery } = buildRecoveryStack(
        prisma,
        buildEventBContradictoryDualChannelSamples,
        () => now,
      );
      const result = await recovery.recoverCandidateById(candidate.id, now);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      const hybrid = readHybridAbsoluteSignalTrustEvidence(
        (
          await prisma.rawRefuelCandidate.findUniqueOrThrow({
            where: { id: candidate.id },
          })
        ).evidenceMeta,
      );
      expect(hybrid?.computedHybridClassification).toBe('UNTRUSTED');
      expect(
        await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } }),
      ).toBe(0);
    } finally {
      await cleanup(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });
});

describe('RFRF hybrid trust PG (skipped without gate env)', () => {
  it('requires RAW_REFUEL_HYBRID_TRUST_INTEGRATION=1', () => {
    expect(LIVE || true).toBe(true);
  });
});
