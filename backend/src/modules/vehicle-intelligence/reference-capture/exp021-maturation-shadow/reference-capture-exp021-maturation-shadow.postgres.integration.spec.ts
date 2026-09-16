/**
 * PostgreSQL integration — EXP-021 Live Maturation Shadow PR-M1 persistence foundation.
 * Skipped unless REFERENCE_CAPTURE_POSTGRES_INTEGRATION=1.
 */
import { randomUUID } from 'crypto';
import type { Exp021MaturationShadowWindow } from '@prisma/client';
import {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
  PrismaClient,
} from '@prisma/client';
import {
  Exp021MaturationShadowAttemptAuthorityError,
  Exp021MaturationShadowFamilyIdentityError,
  Exp021MaturationShadowOffScheduleSlotError,
  Exp021MaturationShadowProviderOutcomeConsistencyError,
  Exp021MaturationShadowStratumSemanticMismatchError,
} from './reference-capture-exp021-maturation-shadow.errors';
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

function baseStratumInput(
  windowFamilyId: string,
  signalLane: Exp021MaturationShadowSignalLane,
  geometryMs: number,
  overrides: Partial<{
    activityClassificationJson: Record<string, string>;
    signalSetHash: string;
    querySemanticsHash: string;
    windowTo: Date;
  }> = {},
) {
  const windowTo = overrides.windowTo ?? new Date('2026-09-16T20:34:00.000Z');
  const windowFrom = new Date(windowTo.getTime() - geometryMs);
  return {
    windowFamilyId,
    signalLane,
    queryGeometryMs: geometryMs,
    windowFrom,
    windowTo,
    resolvedProviderFields: ['speed'],
    resolvedProviderFieldsCanonicalSorted: ['speed'],
    signalSetHash: overrides.signalSetHash ?? `hash-${signalLane}-${geometryMs}`,
    signalSetVersion: 'v1',
    querySemanticsHash: overrides.querySemanticsHash ?? `sem-${signalLane}-${geometryMs}`,
    queryBuilderSemanticVersionOrHash: 'qb-v1',
    queryBoundarySemanticVersion: 'bound-v1',
    interval: '1s',
    aggregation: 'LAST',
    runtimeBuildShaAtEnrollment: 'enroll-sha',
    activityClassificationJson: overrides.activityClassificationJson,
  };
}

function attemptRawFacts(
  stratum: Pick<Exp021MaturationShadowWindow, 'windowTo' | 'querySemanticsHash' | 'signalSetHash'>,
  overrides: Partial<{
    plannedAgeMs: number;
    actualAgeOffsetMs: number;
    requestStartedAt: Date;
    requestCompletedAt: Date | null;
    providerRequestSucceeded: boolean;
    providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
    providerErrorClass: string | null;
    uniqueBucketLocusCount: number | null;
    querySemanticsHash: string;
    signalSetHash: string;
  }> = {},
) {
  const plannedAgeMs = overrides.plannedAgeMs ?? 45_000;
  const actualAgeOffsetMs = overrides.actualAgeOffsetMs ?? 45_300;
  const requestStartedAt =
    overrides.requestStartedAt ?? new Date(stratum.windowTo.getTime() + actualAgeOffsetMs);
  const providerOutcomeClass =
    overrides.providerOutcomeClass ?? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO;

  return {
    plannedAgeMs,
    requestStartedAt,
    requestCompletedAt:
      overrides.requestCompletedAt ?? new Date(requestStartedAt.getTime() + 500),
    runtimeBuildSha: 'runtime-sha',
    querySemanticsHash: overrides.querySemanticsHash ?? stratum.querySemanticsHash,
    signalSetHash: overrides.signalSetHash ?? stratum.signalSetHash,
    providerRequestSucceeded: overrides.providerRequestSucceeded ?? true,
    providerOutcomeClass,
    providerStatus: overrides.providerRequestSucceeded === false ? 'TRANSPORT_ERROR' : 'OK',
    providerErrorClass: overrides.providerErrorClass ?? null,
    uniqueBucketLocusCount:
      providerOutcomeClass === Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR
        ? (overrides.uniqueBucketLocusCount ?? null)
        : (overrides.uniqueBucketLocusCount ?? 3),
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

  it('A: same family identity + different enrollmentEventId + same schedule returns same family', async () => {
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

    const familyA = await repository.reserveOrGetWindowFamily({ ...base, enrollmentEventId: 'enroll-a' });
    const familyB = await repository.reserveOrGetWindowFamily({ ...base, enrollmentEventId: 'enroll-b' });
    expect(familyA.id).toBe(familyB.id);

    await cleanupShadowGraph(prisma, familyA.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('B/C: family schedule drift on plannedAgesMsExact or policyDelayProbeMs fails closed', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const canonicalWindowTo = new Date('2026-09-16T20:35:00.000Z');
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo,
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-schedule',
      plannedAgesMsExact: [45_000, 50_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha-a',
    });

    await expect(
      repository.reserveOrGetWindowFamily({
        organizationId,
        vehicleId,
        tokenId: 187336,
        canonicalWindowTo,
        shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
        enrollmentEventId: 'enroll-other',
        plannedAgesMsExact: [45_000, 55_000],
        policyDelayProbeMs: 8000,
        createdUnderRuntimeSha: 'sha-b',
      }),
    ).rejects.toThrow(Exp021MaturationShadowFamilyIdentityError);

    await expect(
      repository.reserveOrGetWindowFamily({
        organizationId,
        vehicleId,
        tokenId: 187336,
        canonicalWindowTo,
        shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
        enrollmentEventId: 'enroll-other',
        plannedAgesMsExact: [45_000, 50_000],
        policyDelayProbeMs: 9000,
        createdUnderRuntimeSha: 'sha-c',
      }),
    ).rejects.toThrow(Exp021MaturationShadowFamilyIdentityError);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('D/E: activityClassificationJson key-order equal; material drift fails closed', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:00:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-activity',
      plannedAgesMsExact: [45_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });

    const activity = { class: 'ACTIVE_MOTION', source: 'X' };
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000, {
        activityClassificationJson: activity,
      }),
    );
    const sameSemantics = await repository.createWindowStratum({
      ...baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000, {
        activityClassificationJson: { source: 'X', class: 'ACTIVE_MOTION' },
      }),
    });
    expect(sameSemantics.id).toBe(stratum.id);

    await expect(
      repository.createWindowStratum({
        ...baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000, {
          activityClassificationJson: { class: 'IDLE', source: 'X' },
        }),
      }),
    ).rejects.toThrow(Exp021MaturationShadowStratumSemanticMismatchError);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('F: off-schedule slot rejected; on-schedule slot allowed', async () => {
    const { organizationId, vehicleId } = await seedOrgVehicle(prisma);
    const family = await repository.reserveOrGetWindowFamily({
      organizationId,
      vehicleId,
      tokenId: 187336,
      canonicalWindowTo: new Date('2026-09-16T21:05:00.000Z'),
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: 'enroll-slot',
      plannedAgesMsExact: [45_000, 50_000],
      policyDelayProbeMs: 8000,
      createdUnderRuntimeSha: 'sha',
    });
    const stratum = await repository.createWindowStratum(
      baseStratumInput(family.id, Exp021MaturationShadowSignalLane.HF_FAST_LOOP, 60_000),
    );

    await expect(
      repository.createObservationSlot({ windowStratumId: stratum.id, plannedAgeMs: 47_000 }),
    ).rejects.toThrow(Exp021MaturationShadowOffScheduleSlotError);

    const slot = await repository.createObservationSlot({
      windowStratumId: stratum.id,
      plannedAgeMs: 45_000,
    });
    expect(slot.plannedAgeMs).toBe(45_000);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('G-K/L: attempt parent authority, derived ages, provider outcomes, post-hoc nulls', async () => {
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

    const failed = await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts(stratum, {
        providerRequestSucceeded: false,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
        providerErrorClass: 'NETWORK_TIMEOUT',
        uniqueBucketLocusCount: null,
      }),
    });
    const zeroSuccess = await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts(stratum, {
        actualAgeOffsetMs: 46_000,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
        uniqueBucketLocusCount: 0,
      }),
    });
    const nonzeroSuccess = await repository.insertObservationAttempt({
      observationSlotId: slot.id,
      rawFacts: attemptRawFacts(stratum, {
        actualAgeOffsetMs: 51_000,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
        uniqueBucketLocusCount: 5,
      }),
    });

    expect(failed.actualAgeMs).toBe(45_300);
    expect(failed.schedulerDriftMs).toBe(300);
    expect(nonzeroSuccess.actualAgeMs).toBe(51_000);
    expect(nonzeroSuccess.schedulerDriftMs).toBe(6_000);
    expect(failed.newBucketLociVsPriorAge).toBeNull();
    expect(failed.bucketLocusCoverageRatioVsFinalObservedUnion).toBeNull();

    await expect(
      repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: attemptRawFacts(stratum, { plannedAgeMs: 46_000 }),
      }),
    ).rejects.toThrow(Exp021MaturationShadowAttemptAuthorityError);

    await expect(
      repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: attemptRawFacts(stratum, { signalSetHash: 'wrong-hash' }),
      }),
    ).rejects.toThrow(Exp021MaturationShadowAttemptAuthorityError);

    await expect(
      repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: attemptRawFacts(stratum, { querySemanticsHash: 'wrong-sem' }),
      }),
    ).rejects.toThrow(Exp021MaturationShadowAttemptAuthorityError);

    await expect(
      repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: attemptRawFacts(stratum, {
          requestStartedAt: new Date(stratum.windowTo.getTime() + 52_000),
          requestCompletedAt: new Date(stratum.windowTo.getTime() + 51_000),
        }),
      }),
    ).rejects.toThrow(Exp021MaturationShadowAttemptAuthorityError);

    await expect(
      repository.insertObservationAttempt({
        observationSlotId: slot.id,
        rawFacts: attemptRawFacts(stratum, {
          providerRequestSucceeded: false,
          providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
          uniqueBucketLocusCount: 0,
        }),
      }),
    ).rejects.toThrow(Exp021MaturationShadowProviderOutcomeConsistencyError);

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });

  it('M: concurrent family, stratum, slot, and attempt ordinals remain canonical', async () => {
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
    expect(new Set(families.map((row) => row.id)).size).toBe(1);

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
        repository.createObservationSlot({ windowStratumId: strata[0].id, plannedAgeMs: 45_000 }),
      ),
    );
    expect(new Set(slots.map((row) => row.id)).size).toBe(1);

    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.insertObservationAttempt({
          observationSlotId: slots[0].id,
          rawFacts: attemptRawFacts(strata[0], {
            actualAgeOffsetMs: 45_000 + index * 100,
            providerOutcomeClass:
              index % 2 === 0
                ? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR
                : Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
            providerRequestSucceeded: index % 2 !== 0,
            providerErrorClass: index % 2 === 0 ? 'NETWORK' : null,
            uniqueBucketLocusCount: index % 2 === 0 ? null : 2,
          }),
        }),
      ),
    );
    expect(attempts.map((row) => row.attemptOrdinal).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

    await cleanupShadowGraph(prisma, families[0].id);
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
      rawFacts: attemptRawFacts(stratum),
    });

    await expect(
      prisma.exp021MaturationShadowWindowFamily.delete({ where: { id: family.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await cleanupShadowGraph(prisma, family.id);
    await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${vehicleId}`;
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}`;
  });
});
