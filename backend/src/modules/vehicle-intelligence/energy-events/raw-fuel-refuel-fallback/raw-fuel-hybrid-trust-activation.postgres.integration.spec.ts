/**
 * Scoped hybrid trust activation — PostgreSQL promotion proofs (P1–P7).
 * Gate: rfrf-hybrid-trust-activation-postgres-gate.sh
 */
import { randomUUID } from 'crypto';
import { FuelType, PrismaClient, type RawRefuelCandidate } from '@prisma/client';
import {
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import {
  RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV,
} from './raw-fuel-hybrid-trust-activation.authority';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawRefuelPromotionService } from './raw-refuel-promotion.service';
import { RawRefuelCandidateRecoveryRepository } from '../raw-refuel-candidate/raw-refuel-candidate-recovery.repository';
import { RawRefuelCandidateRecoveryService } from '../raw-refuel-candidate/raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import {
  buildHybridTrustActivationEvidenceMeta,
  mergeHybridTrustActivationIntoEvidenceMeta,
  readHybridTrustActivationFromEvidenceMeta,
  readPromotionTimeHybridTrustActivationFromQualityMeta,
} from './raw-fuel-hybrid-trust-activation-metadata';
import {
  resolveHybridTrustActivationDecision,
  RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION,
} from './raw-fuel-hybrid-trust-activation.authority';
import {
  buildHybridAbsoluteSignalTrustEvidence,
  mergeHybridAbsoluteSignalTrustEvidence,
} from './raw-fuel-hybrid-trust-evidence-metadata';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  buildReadyEvidenceRefreshMeta,
  mergeReadyEvidenceRefreshIntoEvidenceMeta,
} from './raw-refuel-ready-evidence-refresh-metadata';
import { evaluateReadyCandidateRefreshRequirement } from './raw-refuel-ready-evidence-refresh.policy';
import {
  RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { buildEvidenceRevisionFingerprint } from '../raw-refuel-candidate/raw-refuel-candidate-evidence-fingerprint';
import { candidateRowToEvidenceSlice } from '../raw-refuel-candidate/raw-refuel-candidate-evidence-merge';
import { nativeSameSiblingFromCandidate } from './testing/f5-pr3-g2-handoff.harness';
import type { RawFuelAbsoluteSignalTrust } from './raw-fuel-refuel-fallback.types';
import type { RawFuelHybridTrustReasonCode } from './raw-fuel-hybrid-absolute-signal-trust.authority';

const LIVE = process.env.RAW_REFUEL_HYBRID_TRUST_ACTIVATION_INTEGRATION === '1';
const DEFAULT_CUTOVER = '2026-09-06T08:00:00.000Z';

function setEnv(allowOrgId: string | null, promotion = true): () => void {
  const prev: Record<string, string | undefined> = {
    master: process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    persist: process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    convergence: process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
    promotion: process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
    recovery: process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
    cutover: process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
    mode: process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV],
    orgs: process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV],
    vehicles: process.env[RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV],
  };
  process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
  process.env[RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV] = 'true';
  process.env[RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV] = promotion ? 'true' : 'false';
  process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV] = 'true';
  process.env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV] = DEFAULT_CUTOVER;
  if (allowOrgId) {
    process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV] = 'ALPHA_ALLOWLIST';
    process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV] = allowOrgId;
  } else {
    delete process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV];
    delete process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV];
  }
  delete process.env[RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV];
  return () => {
    for (const [key, envKey] of [
      ['master', RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
      ['persist', RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
      ['convergence', RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV],
      ['promotion', RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV],
      ['recovery', RFRF_CANDIDATE_RECOVERY_ENABLED_ENV],
      ['cutover', RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV],
      ['mode', RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV],
      ['orgs', RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV],
      ['vehicles', RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV],
    ] as const) {
      const v = prev[key];
      if (v === undefined) delete process.env[envKey];
      else process.env[envKey] = v;
    }
  };
}

(LIVE ? describe : describe.skip)('RFRF hybrid trust activation (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  }, 30_000);

  async function seedVehicle(suffix: string) {
    const org = await prisma.organization.create({
      data: { companyName: `Act ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const dimoVehicle = await prisma.dimoVehicle.create({
      data: {
        externalId: `act-${suffix}`,
        tokenId: 970000 + Math.floor(Math.random() * 10000),
        fuelType: 'GASOLINE',
        powertrainType: 'ICE',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        dimoVehicleId: dimoVehicle.id,
        vin: `A${suffix}`.slice(0, 17).padEnd(17, '0'),
        licensePlate: `A-${suffix}`.slice(0, 12),
        make: 'Test',
        model: 'RFRF',
        year: 2024,
        fuelType: FuelType.GASOLINE,
        status: 'AVAILABLE',
      },
    });
    return { org, vehicle, dimoVehicle };
  }

  type SeedCandidateTrustShape = {
    rowAbsoluteSignalTrust: RawFuelAbsoluteSignalTrust;
    computedHybrid: RawFuelAbsoluteSignalTrust;
    /** intentionally stale activation audit persisted at seed time */
    embedStaleActivationAudit?: boolean;
    omitHybridProvenance?: boolean;
  };

  async function seedReadyCandidate(
    orgId: string,
    vehicleId: string,
    trust: SeedCandidateTrustShape,
  ): Promise<RawRefuelCandidate> {
    const now = new Date('2026-09-06T09:00:00.000Z');
    const materialRiseLiters = RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.materialRiseLiters;
    const materialRisePercent = RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relative.materialRisePercent;
    const computed = trust.computedHybrid;
    const rowTrust = trust.rowAbsoluteSignalTrust;
    const hybridReasonCode: RawFuelHybridTrustReasonCode =
      computed === 'UNTRUSTED'
        ? 'RELATIVE_CONTRADICTS_ABSOLUTE'
        : computed === 'TRUSTED'
          ? 'CORROBORATED_RISE'
          : 'RELATIVE_COVERAGE_INSUFFICIENT';

    const staleActivationDecision = trust.embedStaleActivationAudit
      ? {
          activationPolicyVersion: RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION,
          activationMode: 'OFF' as const,
          activationAuthorized: true,
          activationScopeType: 'ORGANIZATION' as const,
          computedHybridClassification: 'TRUSTED' as const,
          effectiveAbsoluteSignalTrust: 'TRUSTED' as const,
        }
      : resolveHybridTrustActivationDecision({
          organizationId: orgId,
          vehicleId,
          computedHybridClassification: computed,
        });

    const baselineMeta = buildBaselineRecencyEvidenceMeta({
      classification: 'FRESH',
      reason: 'activation_pg_test',
      bridgeGapSeconds: 60,
      prePlateauStartAt: new Date('2026-09-06T08:00:00.000Z'),
      prePlateauEndAt: new Date('2026-09-06T08:15:00.000Z'),
      riseOnsetAt: new Date('2026-09-06T08:16:00.000Z'),
      interveningPrimarySampleCount: 0,
      interveningContradictionCount: 0,
    });
    const refreshMeta = buildReadyEvidenceRefreshMeta({
      baselineRecencyClassification: 'FRESH',
      absoluteSignalTrust: rowTrust,
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      relativeSignalAvailable: true,
      hybridTrustReasonCode: hybridReasonCode,
      hybridTrustAuthorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    });
    let evidenceMeta = mergeReadyEvidenceRefreshIntoEvidenceMeta(baselineMeta, refreshMeta);
    if (!trust.omitHybridProvenance) {
      const hybridBlock = buildHybridAbsoluteSignalTrustEvidence(
        {
          authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
          classification: computed,
          reasonCode: hybridReasonCode,
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          relativeSampleCoverage: 'SUFFICIENT',
          baselineRecencyClassification: 'FRESH',
          absoluteDeltaLiters: 20,
          relativeDeltaPercent:
            computed === 'UNTRUSTED' ? -materialRisePercent : materialRisePercent + 1,
          materialRiseLiters,
          materialRisePercent,
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
        {
          relativePrePlateauLocal: 'VALID',
          relativePostPlateauLocal: 'VALID',
          absolutePostPlateauLocal: 'VALID',
        },
      );
      evidenceMeta = mergeHybridAbsoluteSignalTrustEvidence(evidenceMeta, hybridBlock);
    }
    evidenceMeta = mergeHybridTrustActivationIntoEvidenceMeta(
      evidenceMeta,
      buildHybridTrustActivationEvidenceMeta(staleActivationDecision),
    );
    const qualityMeta = { absoluteDetectionAdmissibility: 'ADMISSIBLE' };
    const slice = {
      organizationId: orgId,
      vehicleId,
      detectionVersion: RFRF_RISE_DETECTION_VERSION,
      detectorVersion: RFRF_RISE_DETECTOR_VERSION,
      signalChannel: 'ABSOLUTE_LITERS' as const,
      physicalEvidenceStart: new Date('2026-09-06T08:00:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-06T08:40:00.000Z'),
      riseOnsetAt: new Date('2026-09-06T08:16:00.000Z'),
      riseEndAt: new Date('2026-09-06T08:28:00.000Z'),
      preFuelAbsoluteLiters: 10,
      postFuelAbsoluteLiters: 30,
      deltaAbsoluteLiters: 20,
      preFuelRelativePercent: null,
      postFuelRelativePercent: null,
      deltaRelativePercent: null,
      prePlateauSampleCount: 3,
      postPlateauSampleCount: 3,
      totalSampleCount: 10,
      maxSampleGapSeconds: 120,
      absoluteSignalTrust: rowTrust,
      relativeSignalAvailable: true,
      routeEvidenceAvailable: false,
      stationaryEvidenceAvailable: false,
      scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      signalProvider: 'DIMO',
      evidenceMeta,
      qualityMeta,
    };
    const evidenceRevisionFingerprint = buildEvidenceRevisionFingerprint(slice);

    const row = await prisma.rawRefuelCandidate.create({
      data: {
        organizationId: orgId,
        vehicleId,
        lifecycleState: 'READY_FOR_PERSIST',
        signalChannel: 'ABSOLUTE_LITERS',
        detectionVersion: RFRF_RISE_DETECTION_VERSION,
        detectorVersion: RFRF_RISE_DETECTOR_VERSION,
        absoluteSignalTrust: rowTrust,
        relativeSignalAvailable: true,
        riseOnsetAt: slice.riseOnsetAt,
        riseEndAt: slice.riseEndAt,
        physicalEvidenceStart: slice.physicalEvidenceStart,
        physicalEvidenceEnd: slice.physicalEvidenceEnd,
        firstObservedAt: now,
        lastObservedAt: now,
        preFuelAbsoluteLiters: 10,
        postFuelAbsoluteLiters: 30,
        deltaAbsoluteLiters: 20,
        prePlateauSampleCount: 3,
        postPlateauSampleCount: 3,
        totalSampleCount: 10,
        recoveryNextAttemptAt: new Date('2026-09-06T10:00:00.000Z'),
        candidateIdentityKey: `act-${randomUUID()}`,
        evidenceRevisionFingerprint,
        evidenceMeta: evidenceMeta as never,
        qualityMeta: qualityMeta as never,
      },
    });
    expect(evaluateReadyCandidateRefreshRequirement(row).status).toBe('REFRESH_CURRENT');
    return row;
  }

  function buildRecovery(clock: Date) {
    const candidateService = RawRefuelCandidateService.withFixedClock(
      prisma as unknown as PrismaService,
      clock,
    );
    return new RawRefuelCandidateRecoveryService(
      prisma as unknown as PrismaService,
      candidateService,
      new RawRefuelConvergenceService(prisma as unknown as PrismaService),
      new RawRefuelPromotionService(prisma as unknown as PrismaService),
    )
      .withLeaseMs(2_000)
      .withRecoveryClock(() => clock);
  }

  async function cleanup(vehicleId: string, orgId: string, dimoId: string) {
    await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } });
    await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.dimoVehicle.deleteMany({ where: { id: dimoId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  }

  it('P1 allowed Alpha org + hybrid TRUSTED + stale row UNKNOWN => one fallback VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const restore = setEnv(org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'UNKNOWN',
        computedHybrid: 'TRUSTED',
        embedStaleActivationAudit: true,
      });
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery(t0).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).toBe('SUCCESS_PROMOTED');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(1);
      const after = await prisma.rawRefuelCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const promotionAudit = readPromotionTimeHybridTrustActivationFromQualityMeta(
        after.qualityMeta,
      );
      expect(promotionAudit?.activationAuthorized).toBe(true);
      expect(promotionAudit?.effectiveAbsoluteSignalTrust).toBe('TRUSTED');
      expect(promotionAudit?.computedHybridClassification).toBe('TRUSTED');
      const staleEvidenceAudit = readHybridTrustActivationFromEvidenceMeta(after.evidenceMeta);
      expect(staleEvidenceAudit?.effectiveAbsoluteSignalTrust).toBe('TRUSTED');
    } finally {
      restore();
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });

  it('P2 replay recovery => still one VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const restore = setEnv(org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'UNKNOWN',
        computedHybrid: 'TRUSTED',
      });
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const recovery = buildRecovery(t0);
      const first = await recovery.recoverCandidateById(candidate.id, t0);
      expect(first.outcome).toBe('SUCCESS_PROMOTED');
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      await recovery.recoverCandidateById(candidate.id, t0);
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(1);
    } finally {
      restore();
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });

  it('P3 non-allowlisted org + hybrid TRUSTED + stale row TRUSTED => zero VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const otherOrg = randomUUID();
    const restore = setEnv(otherOrg, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'TRUSTED',
        computedHybrid: 'TRUSTED',
      });
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery(t0).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });

  it('P4 allowlisted semantic UNKNOWN + stale row TRUSTED => zero VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const restore = setEnv(org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'TRUSTED',
        computedHybrid: 'UNKNOWN',
      });
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery(t0).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    } finally {
      restore();
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });

  it('P5 allowlisted UNTRUSTED + stale row TRUSTED => zero VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const restore = setEnv(org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'TRUSTED',
        computedHybrid: 'UNTRUSTED',
      });
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery(t0).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    } finally {
      restore();
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });

  it('P6 native SAME + activated hybrid TRUSTED => CONVERGED_NATIVE, zero fallback duplicate', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const restore = setEnv(org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    const promotion = new RawRefuelPromotionService(prisma as unknown as PrismaService);
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'UNKNOWN',
        computedHybrid: 'TRUSTED',
      });
      await prisma.vehicleEnergyEvent.create({
        data: nativeSameSiblingFromCandidate(candidate, suffix),
      });
      const result = await promotion.evaluateAndApplyPromotion(
        candidate,
        {
          capability: 'FUEL_CAPABLE',
          absoluteDetectionAdmissibility: 'ADMISSIBLE',
          absoluteSignalTrust: 'TRUSTED',
        },
        process.env,
      );
      expect(result.status).toBe('CONVERGED_NATIVE');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });

  it('P7 tenant isolation — allowlist org A does not authorize org B vehicle', async () => {
    const suffix = randomUUID().slice(0, 8);
    const a = await seedVehicle(`${suffix}-a`);
    const b = await seedVehicle(`${suffix}-b`);
    const restore = setEnv(a.org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    try {
      const candidate = await seedReadyCandidate(b.org.id, b.vehicle.id, {
        rowAbsoluteSignalTrust: 'TRUSTED',
        computedHybrid: 'TRUSTED',
      });
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery(t0).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: b.vehicle.id } })).toBe(0);
    } finally {
      restore();
      await cleanup(a.vehicle.id, a.org.id, a.dimoVehicle.id);
      await cleanup(b.vehicle.id, b.org.id, b.dimoVehicle.id);
    }
  });

  it('P7b candidate organizationId mismatch vs vehicle row => zero VEE', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle, dimoVehicle } = await seedVehicle(suffix);
    const foreignOrg = await prisma.organization.create({
      data: { companyName: `Foreign ${suffix}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const restore = setEnv(org.id, true);
    const t0 = new Date('2026-09-06T10:00:00.000Z');
    try {
      const candidate = await seedReadyCandidate(org.id, vehicle.id, {
        rowAbsoluteSignalTrust: 'UNKNOWN',
        computedHybrid: 'TRUSTED',
      });
      await prisma.rawRefuelCandidate.update({
        where: { id: candidate.id },
        data: { organizationId: foreignOrg.id },
      });
      const repo = new RawRefuelCandidateRecoveryRepository(prisma as unknown as PrismaService);
      await repo.claimDueCandidates(1, t0, new Date(t0.getTime() + 60_000));
      const result = await buildRecovery(t0).recoverCandidateById(candidate.id, t0);
      expect(result.outcome).not.toBe('SUCCESS_PROMOTED');
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: { vehicleId: vehicle.id, detectionSource: 'SYNQDRIVE_RAW_FUEL_FALLBACK' },
        }),
      ).toBe(0);
    } finally {
      restore();
      await prisma.organization.deleteMany({ where: { id: foreignOrg.id } });
      await cleanup(vehicle.id, org.id, dimoVehicle.id);
    }
  });
});

describe('RFRF hybrid trust activation PG (skipped without gate env)', () => {
  it('requires RAW_REFUEL_HYBRID_TRUST_ACTIVATION_INTEGRATION=1', () => {
    if (process.env.RAW_REFUEL_HYBRID_TRUST_ACTIVATION_INTEGRATION === '1') return;
    expect(process.env.RAW_REFUEL_HYBRID_TRUST_ACTIVATION_INTEGRATION).not.toBe('1');
  });
});
