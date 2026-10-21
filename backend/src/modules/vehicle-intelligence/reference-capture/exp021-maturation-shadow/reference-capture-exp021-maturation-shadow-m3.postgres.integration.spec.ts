/**
 * PostgreSQL integration — EXP-021 Live Maturation Shadow PR-M3 read-only analytics proof.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  PrismaClient,
} from '@prisma/client';
import { analyzeExp021MaturationShadowM3 } from './reference-capture-exp021-maturation-shadow-m3-analyzer.lib';
import {
  captureM3ScientificFingerprint,
  m3ScientificFingerprintsIdentical,
  proveM3ReadOnlyNonInterference,
} from './reference-capture-exp021-maturation-shadow-m3-fingerprint.lib';
import { loadExp021MaturationShadowFamiliesForM3 } from './reference-capture-exp021-maturation-shadow-m3.repository';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import {
  EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
  type Exp021MaturationShadowQueryGeometryMs,
} from './reference-capture-exp021-maturation-shadow.types';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

async function seedOrgVehicle(prisma: PrismaClient): Promise<{ organizationId: string; vehicleId: string }> {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const vin = `M3${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Shadow PR-M3 Org'}, 'FLEET', NOW(), NOW())
  `;
  await prisma.$executeRaw`
    INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at)
    VALUES (${vehicleId}, ${organizationId}, ${vin}, 'Test', 'EXP021-M3', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW())
  `;
  return { organizationId, vehicleId };
}

async function cleanupShadowGraph(prisma: PrismaClient, familyId: string): Promise<void> {
  const strata = await prisma.exp021MaturationShadowWindow.findMany({ where: { windowFamilyId: familyId } });
  for (const stratum of strata) {
    const slots = await prisma.exp021MaturationShadowObservationSlot.findMany({
      where: { windowStratumId: stratum.id },
    });
    for (const slot of slots) {
      await prisma.exp021MaturationShadowObservationAttempt.deleteMany({
        where: { observationSlotId: slot.id },
      });
    }
    await prisma.exp021MaturationShadowObservationSlot.deleteMany({ where: { windowStratumId: stratum.id } });
  }
  await prisma.exp021MaturationShadowWindow.deleteMany({ where: { windowFamilyId: familyId } });
  await prisma.exp021MaturationShadowWindowFamily.deleteMany({ where: { id: familyId } });
}

function baseStratumInput(
  windowFamilyId: string,
  signalLane: Exp021MaturationShadowSignalLane,
  geometryMs: Exp021MaturationShadowQueryGeometryMs,
  canonicalWindowTo: Date,
) {
  const windowTo = canonicalWindowTo;
  const windowFrom = new Date(windowTo.getTime() - geometryMs);
  return {
    windowFamilyId,
    signalLane,
    queryGeometryMs: geometryMs,
    windowFrom,
    windowTo,
    resolvedProviderFields: ['speed'],
    resolvedProviderFieldsCanonicalSorted: ['speed'],
    signalSetHash: `hash-${signalLane}-${geometryMs}`,
    signalSetVersion: 'v1',
    querySemanticsHash: `sem-${signalLane}-${geometryMs}`,
    queryBuilderSemanticVersionOrHash: 'qb-v1',
    queryBoundarySemanticVersion: 'bound-v1',
    interval: '1s',
    aggregation: 'LAST',
    runtimeBuildShaAtEnrollment: 'enroll-sha',
    activityClassificationJson: { class: 'UNKNOWN_ACTIVITY', geometryMs },
  };
}

function attemptRawFacts(
  stratum: { windowTo: Date; querySemanticsHash: string; signalSetHash: string },
  overrides: Partial<{
    plannedAgeMs: number;
    actualAgeOffsetMs: number;
    providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
    uniqueBucketLocusCount: number | null;
    bucketLocusManifestJson: string[];
  }> = {},
) {
  const plannedAgeMs = overrides.plannedAgeMs ?? 45_000;
  const actualAgeOffsetMs = overrides.actualAgeOffsetMs ?? 45_300;
  const requestStartedAt = new Date(stratum.windowTo.getTime() + actualAgeOffsetMs);
  const providerOutcomeClass =
    overrides.providerOutcomeClass ?? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO;

  return {
    plannedAgeMs,
    requestStartedAt,
    requestCompletedAt: new Date(requestStartedAt.getTime() + 500),
    runtimeBuildSha: 'runtime-sha',
    querySemanticsHash: stratum.querySemanticsHash,
    signalSetHash: stratum.signalSetHash,
    providerRequestSucceeded: providerOutcomeClass !== Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
    providerOutcomeClass,
    providerStatus: providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR ? 'ERROR' : 'OK',
    providerErrorClass: providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR ? 'TRANSPORT_ERROR' : null,
    uniqueBucketLocusCount:
      providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR
        ? null
        : (overrides.uniqueBucketLocusCount ?? (providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO ? 0 : 1)),
    bucketLocusManifestJson:
      overrides.bucketLocusManifestJson ??
      (providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO
        ? ['speed|2026-09-16T11:59:30.000Z']
        : []),
    bucketLocusIdentityVersion: 'FIELD_PIPE_CANONICAL_ISO_MS',
  };
}

(LIVE ? describe : describe.skip)('EXP-021 maturation shadow PostgreSQL integration (PR-M3)', () => {
  let prisma: PrismaClient;
  let repository: ReferenceCaptureExp021MaturationShadowRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = buildReferenceCapturePostgresDatabaseUrl();
    proveIsolatedReferenceCapturePostgres();
    const ok = await probeReferenceCapturePostgresDatabase();
    if (!ok) throw new Error('REFERENCE_CAPTURE_POSTGRES_INTEGRATION requires isolated Postgres');
    prisma = new PrismaClient();
    repository = new ReferenceCaptureExp021MaturationShadowRepository(prisma as never);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('30) M3 analysis/export is read-only over M1/M2 scientific rows and canonical state', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const canonicalWindowTo = new Date('2026-09-16T22:00:00.000Z');
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo,
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-m3-readonly',
      plannedAgesMsExact: [30_000, 45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha-m3',
    });
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, 60_000, canonicalWindowTo),
    );
    const slot30 = await repository.createObservationSlot({ windowStratumId: stratum.id, plannedAgeMs: 30_000 });
    const slot45 = await repository.createObservationSlot({ windowStratumId: stratum.id, plannedAgeMs: 45_000 });

    await repository.insertObservationAttempt({
      observationSlotId: slot30.id,
      rawFacts: attemptRawFacts(stratum, {
        plannedAgeMs: 30_000,
        actualAgeOffsetMs: 30_200,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
        uniqueBucketLocusCount: 0,
        bucketLocusManifestJson: [],
      }),
    });
    await repository.insertObservationAttempt({
      observationSlotId: slot45.id,
      rawFacts: attemptRawFacts(stratum, {
        plannedAgeMs: 45_000,
        actualAgeOffsetMs: 45_400,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
      }),
    });

    const scope = { organizationId, vehicleId };
    const proof = await proveM3ReadOnlyNonInterference(prisma, scope, async () => {
      const families = await loadExp021MaturationShadowFamiliesForM3(prisma, scope);
      const analysis = analyzeExp021MaturationShadowM3({ families, scope });
      expect(analysis.aggregateCounts.nWindowFamilies).toBe(1);
      expect(analysis.stratumAnalyses[0].availabilityTransition.censoringClass).toBe('INTERVAL_CENSORED');
    });

    expect(proof.canonicalStateIdentical).toBe(true);
    expect(proof.scientificStateIdentical).toBe(true);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('31) content fingerprint detects in-place M1/M2 mutation but M3 analysis leaves it identical', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const canonicalWindowTo = new Date('2026-09-16T22:30:00.000Z');
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo,
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-m3-fingerprint',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha-m3-fp',
    });
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, 60_000, canonicalWindowTo),
    );
    const slot45 = await repository.createObservationSlot({ windowStratumId: stratum.id, plannedAgeMs: 45_000 });
    const inserted = await repository.insertObservationAttempt({
      observationSlotId: slot45.id,
      rawFacts: attemptRawFacts(stratum, {
        plannedAgeMs: 45_000,
        actualAgeOffsetMs: 45_400,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
      }),
    });

    const scope = { organizationId, vehicleId };
    const before = await captureM3ScientificFingerprint(prisma, scope);

    await prisma.exp021MaturationShadowObservationAttempt.update({
      where: { id: inserted.id },
      data: { actualAgeMs: 46_000 },
    });

    const afterMutation = await captureM3ScientificFingerprint(prisma, scope);
    expect(m3ScientificFingerprintsIdentical(before, afterMutation)).toBe(false);
    expect(before.contentDigest).not.toBe(afterMutation.contentDigest);

    await prisma.exp021MaturationShadowObservationAttempt.update({
      where: { id: inserted.id },
      data: { actualAgeMs: 45_400 },
    });

    const proof = await proveM3ReadOnlyNonInterference(prisma, scope, async () => {
      const families = await loadExp021MaturationShadowFamiliesForM3(prisma, scope);
      analyzeExp021MaturationShadowM3({ families, scope });
    });
    expect(proof.scientificStateIdentical).toBe(true);
    expect(proof.canonicalStateIdentical).toBe(true);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });
});
