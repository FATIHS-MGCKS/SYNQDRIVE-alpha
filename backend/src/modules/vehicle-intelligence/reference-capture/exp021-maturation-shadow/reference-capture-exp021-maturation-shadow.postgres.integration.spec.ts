/**
 * PostgreSQL integration — EXP-021 Live Maturation Shadow PR-M1 persistence foundation.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  PrismaClient,
} from '@prisma/client';
import { Exp021MaturationShadowStratumSemanticMismatchError } from './reference-capture-exp021-maturation-shadow.errors';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1 } from './reference-capture-exp021-maturation-shadow.types';
import {
  buildReferenceCapturePostgresDatabaseUrl,
  proveIsolatedReferenceCapturePostgres,
  probeReferenceCapturePostgresDatabase,
} from '../testing/reference-capture-postgres.integration.harness';

const LIVE = process.env.REFERENCE_CAPTURE_POSTGRES_INTEGRATION === '1';

async function seedOrgVehicle(prisma: PrismaClient): Promise<{ organizationId: string; vehicleId: string }> {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const vin = `MS${randomUUID().replace(/-/g, '').slice(0, 14)}`.padEnd(17, '0').slice(0, 17);
  await prisma.$executeRaw`
    INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
    VALUES (${organizationId}, ${'EXP021 Shadow PR-M1 Org'}, 'FLEET', NOW(), NOW())
  `;
  await prisma.$executeRaw`
    INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, status, cleaning_status, health_status, created_at, updated_at)
    VALUES (${vehicleId}, ${organizationId}, ${vin}, 'Test', 'EXP021', 2024, 'ELECTRIC', 'AVAILABLE', 'CLEAN', 'GOOD', NOW(), NOW())
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

function baseStratumInput(windowFamilyId: string, signalLane: Exp021MaturationShadowSignalLane, geometryMs: number) {
  const windowTo = new Date('2026-09-16T20:34:00.000Z');
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
  };
}

function attemptRawFacts(overrides: Partial<{
  plannedAgeMs: number;
  actualAgeMs: number;
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
  providerErrorClass: string | null;
  uniqueBucketLocusCount: number | null;
}> = {}) {
  const plannedAgeMs = overrides.plannedAgeMs ?? 45_000;
  const actualAgeMs = overrides.actualAgeMs ?? 45_300;
  return {
    plannedAgeMs,
    actualAgeMs,
    schedulerDriftMs: actualAgeMs - plannedAgeMs,
    requestStartedAt: new Date('2026-09-16T20:34:45.300Z'),
    requestCompletedAt: new Date('2026-09-16T20:34:45.800Z'),
    runtimeBuildSha: 'runtime-sha',
    querySemanticsHash: 'sem',
    signalSetHash: 'hash',
    providerRequestSucceeded: overrides.providerRequestSucceeded ?? true,
    providerOutcomeClass:
      overrides.providerOutcomeClass ?? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
    providerStatus: overrides.providerRequestSucceeded === false ? 'TRANSPORT_ERROR' : 'OK',
    providerErrorClass: overrides.providerErrorClass ?? null,
    uniqueBucketLocusCount: overrides.uniqueBucketLocusCount ?? 3,
  };
}

(LIVE ? describe : describe.skip)('EXP-021 maturation shadow PostgreSQL integration (PR-M1)', () => {
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

  it('A/B: family canonical uniqueness and different enrollmentEventId returns same family', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const canonicalWindowTo = new Date('2026-09-16T20:34:00.000Z');
    const base = {
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo,
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      plannedAgesMsExact: [40_000, 45_000, 50_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha-main',
    };

    const familyA = await repository.reserveOrGetWindowFamily({
      ...base,
      enrollmentEventId: 'enroll-a',
    });
    const familyB = await repository.reserveOrGetWindowFamily({
      ...base,
      enrollmentEventId: 'enroll-b',
    });

    expect(familyA.id).toBe(familyB.id);
    expect(familyA.enrollmentEventId).toBe('enroll-a');

    const count = await prisma.exp021MaturationShadowWindowFamily.count({
      where: {
        organizationId,
        vehicleId,
        tokenId: 187336,
        canonicalWindowTo,
        shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      },
    });
    expect(count).toBe(1);

    await cleanupShadowGraph(prisma, familyA.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('C: changed signalSetHash fails semantic consistency for same lane/geometry', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:00:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-semantic',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });

    await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
    );

    await expect(
      repository.createWindowStratum({
        ...baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
        signalSetHash: 'changed-hash',
      }),
    ).rejects.toThrow(Exp021MaturationShadowStratumSemanticMismatchError);

    const stratumCount = await prisma.exp021MaturationShadowWindow.count({
      where: { windowFamilyId: family.id, signalLane: 'HF_FAST_LOOP', queryGeometryMs: 60_000 },
    });
    expect(stratumCount).toBe(1);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('D/E: different geometry and lane create valid paired strata', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:10:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-pair',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });

    const hf60 = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
    );
    const hf90 = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 90_000),
    );
    const settle60 = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW, 60_000),
    );

    expect(hf60.id).not.toBe(hf90.id);
    expect(hf60.id).not.toBe(settle60.id);
    expect(await prisma.exp021MaturationShadowWindow.count({ where: { windowFamilyId: family.id } })).toBe(3);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('F/G/H/I/J/K: slot uniqueness, transport retry attempts, provider error vs zero, age truth', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:20:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-attempts',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
    );
    const slot = await repository.createObservationSlot({
      windowStratumId: stratum.id,
      plannedAgeMs: 45_000,
    });
    const slotAgain = await repository.createObservationSlot({
      windowStratumId: stratum.id,
      plannedAgeMs: 45_000,
    });
    expect(slot.id).toBe(slotAgain.id);

    const failed = await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts({
        plannedAgeMs: 45_000,
        actualAgeMs: 45_300,
        providerRequestSucceeded: false,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
        providerErrorClass: 'NETWORK_TIMEOUT',
        uniqueBucketLocusCount: null,
      }),
    });
    const zeroSuccess = await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts({
        plannedAgeMs: 45_000,
        actualAgeMs: 46_000,
        providerRequestSucceeded: true,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
        uniqueBucketLocusCount: 0,
      }),
    });
    const nonzeroSuccess = await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts({
        plannedAgeMs: 45_000,
        actualAgeMs: 51_000,
        providerRequestSucceeded: true,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
        uniqueBucketLocusCount: 5,
      }),
    });

    expect(failed.attemptOrdinal).toBe(1);
    expect(zeroSuccess.attemptOrdinal).toBe(2);
    expect(nonzeroSuccess.attemptOrdinal).toBe(3);
    expect(failed.providerOutcomeClass).toBe('PROVIDER_ERROR');
    expect(zeroSuccess.providerOutcomeClass).toBe('PROVIDER_SUCCESS_ZERO');
    expect(zeroSuccess.uniqueBucketLocusCount).toBe(0);
    expect(nonzeroSuccess.actualAgeMs).toBe(51_000);
    expect(nonzeroSuccess.plannedAgeMs).toBe(45_000);
    expect(nonzeroSuccess.schedulerDriftMs).toBe(6_000);

    const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
      where: { observationSlotId: slot.id },
      orderBy: { attemptOrdinal: 'asc' },
    });
    expect(attempts).toHaveLength(3);
    expect(attempts[0].providerRequestSucceeded).toBe(false);
    expect(attempts[1].uniqueBucketLocusCount).toBe(0);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('L/M/N: concurrent family, stratum, and slot creation resolve to one canonical row', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const canonicalWindowTo = new Date('2026-09-16T21:30:00.000Z');
    const familyInput = {
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo,
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-conc',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    };

    const families = await Promise.all(
      Array.from({ length: 8 }, () => repository.reserveOrGetWindowFamily(familyInput)),
    );
    const uniqueFamilyIds = new Set(families.map((row) => row.id));
    expect(uniqueFamilyIds.size).toBe(1);

    const stratumInput = baseStratumInput(
      families[0].id,
      Exp021MaturationShadowSignalLane.HF_FAST_LOOP,
      60_000,
    );
    const strata = await Promise.all(
      Array.from({ length: 8 }, () => repository.createWindowStratum(stratumInput)),
    );
    expect(new Set(strata.map((row) => row.id)).size).toBe(1);

    const slots = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.createObservationSlot({
          windowStratumId: strata[0].id,
          plannedAgeMs: 45_000,
        }),
      ),
    );
    expect(new Set(slots.map((row) => row.id)).size).toBe(1);

    await cleanupShadowGraph(prisma, families[0].id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('O: concurrent attempt inserts allocate unique ordinals without collision', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:40:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-ordinal',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
    );
    const slot = await repository.createObservationSlot({
      windowStratumId: stratum.id,
      plannedAgeMs: 45_000,
    });

    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.insertObservationAttempt({
          observationSlotId: slot.id,
          rawFacts: attemptRawFacts({
            actualAgeMs: 45_000 + index * 100,
            providerOutcomeClass:
              index % 2 === 0
                ? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR
                : Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
            providerRequestSucceeded: index % 2 !== 0,
            providerErrorClass: index % 2 === 0 ? 'NETWORK' : null,
          }),
        }),
      ),
    );

    const ordinals = attempts.map((row) => row.attemptOrdinal).sort((a, b) => a - b);
    expect(ordinals).toEqual([1, 2, 3, 4, 5, 6]);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('RESTRICT retention prevents deleting family while attempts exist', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:50:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-retain',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
    );
    const slot = await repository.createObservationSlot({
      windowStratumId: stratum.id,
      plannedAgeMs: 45_000,
    });
    await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts(),
    });

    await expect(
      prisma.exp021MaturationShadowWindowFamily.delete({ where: { id: family.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });
});
