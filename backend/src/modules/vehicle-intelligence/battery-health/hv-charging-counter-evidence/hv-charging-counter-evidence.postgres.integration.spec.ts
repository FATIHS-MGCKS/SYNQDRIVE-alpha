import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HV_CHARGING_COUNTER_AVAILABILITY } from './hv-charging-counter-evidence.constants.v1';
import type { HvChargingCounterBucketInputV1 } from './hv-charging-counter-evidence.types.v1';
import { computeHvChargingCounterObservationSetFingerprintV1 } from './hv-charging-counter-evidence.fingerprint.v1';
import { HvChargingCounterEvidenceRepository } from './hv-charging-counter-evidence.repository';

const LIVE = process.env.BATTERY_V2_HV_CHARGING_COUNTER_INTEGRATION === '1';

async function createTenantVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `R22 P1 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `R22${suffix}`.padEnd(17, '0'),
      licensePlate: `R22-${suffix}`,
      make: 'Tesla',
      model: 'M3',
      year: 2024,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
    select: { id: true },
  });
  return { org, vehicle };
}

function basePersistInput(
  orgId: string,
  vehicleId: string,
  segmentFingerprint: string,
  bucketStart: Date,
  buckets: HvChargingCounterBucketInputV1[],
  observationSetFingerprint: string,
) {
  return {
    organizationId: orgId,
    vehicleId,
    segmentFingerprint,
    sourceHvChargeSessionId: null,
    dimoTokenId: 186946,
    queryWindowFrom: bucketStart,
    queryWindowTo: new Date('2026-10-16T19:52:53.932Z'),
    segmentStartAt: bucketStart,
    segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
    providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
    observationSetFingerprint,
    buckets,
  };
}

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

const describePostgres = LIVE ? describe : describe.skip;

describePostgres('HvChargingCounterEvidenceRepository (postgres)', () => {
  const prisma = new PrismaClient();
  const repository = new HvChargingCounterEvidenceRepository(prisma as unknown as PrismaService);

  beforeAll(async () => {
    if (!(await probeDatabase())) {
      throw new Error('DATABASE_URL must reach ephemeral PostgreSQL for R22 integration tests');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  it('idempotent batch + corrected bucket revision chain', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);

    const segmentFingerprint = `dimo-recharge-186946-1792156502931-${suffix}`;
    const bucketStart = new Date('2026-10-16T13:15:02.931Z');
    const bucketsV1 = [
      {
        bucketStartAt: bucketStart,
        bucketEndAt: new Date(bucketStart.getTime() + 60_000),
        valueKwh: 0,
        minKwh: 0,
        maxKwh: 0,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fp1 = computeHvChargingCounterObservationSetFingerprintV1(bucketsV1);

    const first = await repository.persistBatch({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
      sourceHvChargeSessionId: null,
      dimoTokenId: 186946,
      queryWindowFrom: bucketStart,
      queryWindowTo: new Date('2026-10-16T19:52:53.932Z'),
      segmentStartAt: bucketStart,
      segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
      providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
      observationSetFingerprint: fp1,
      buckets: bucketsV1,
    });
    expect(first.created).toBe(true);
    expect(first.revisionsCreated).toBe(1);

    const repeat = await repository.persistBatch({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
      sourceHvChargeSessionId: null,
      dimoTokenId: 186946,
      queryWindowFrom: bucketStart,
      queryWindowTo: new Date('2026-10-16T19:52:53.932Z'),
      segmentStartAt: bucketStart,
      segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
      providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
      observationSetFingerprint: fp1,
      buckets: bucketsV1,
    });
    expect(repeat.created).toBe(false);

    const bucketsV2 = [
      {
        ...bucketsV1[0],
        valueKwh: 0.5,
        minKwh: 0.5,
        maxKwh: 0.5,
      },
    ];
    const fp2 = computeHvChargingCounterObservationSetFingerprintV1(bucketsV2);
    const corrected = await repository.persistBatch({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
      sourceHvChargeSessionId: null,
      dimoTokenId: 186946,
      queryWindowFrom: bucketStart,
      queryWindowTo: new Date('2026-10-16T19:52:53.932Z'),
      segmentStartAt: bucketStart,
      segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
      providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
      observationSetFingerprint: fp2,
      buckets: bucketsV2,
    });
    expect(corrected.created).toBe(true);
    expect(corrected.revisionsCreated).toBe(1);

    const revisions = await prisma.batteryHvChargingCounterObservation.findMany({
      where: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint,
        bucketStartAt: bucketStart,
      },
      orderBy: { revisionNumber: 'asc' },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[0].valueKwh).toBe(0);
    expect(revisions[1].valueKwh).toBe(0.5);
    expect(revisions[1].supersedesObservationId).toBe(revisions[0].id);

    const provenance = revisions[0].provenance as { sampleClass?: string };
    expect(provenance.sampleClass).toBe('NOT_RAW_NATIVE_SAMPLE');
  });

  it('concurrent identical batch writers collapse to one batch', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `concurrent-identical-${suffix}`;
    const bucketStart = new Date('2026-10-16T14:00:00.000Z');
    const buckets = [
      {
        bucketStartAt: bucketStart,
        bucketEndAt: new Date(bucketStart.getTime() + 60_000),
        valueKwh: 1,
        minKwh: 1,
        maxKwh: 1,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fp = computeHvChargingCounterObservationSetFingerprintV1(buckets);
    const input = basePersistInput(org.id, vehicle.id, segmentFingerprint, bucketStart, buckets, fp);

    const [a, b] = await Promise.all([
      repository.persistBatch(input),
      repository.persistBatch(input),
    ]);

    const createdCount = [a, b].filter((r) => r.created).length;
    expect(createdCount).toBe(1);
    expect(a.batchId).toBe(b.batchId);

    const batchCount = await prisma.batteryHvChargingCounterIngestionBatch.count({
      where: { organizationId: org.id, vehicleId: vehicle.id, segmentFingerprint },
    });
    expect(batchCount).toBe(1);
  });

  it('concurrent corrected-bucket writers preserve revision uniqueness and supersedes chain', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `concurrent-corrected-${suffix}`;
    const bucketStart = new Date('2026-10-16T15:00:00.000Z');
    const bucketsV1 = [
      {
        bucketStartAt: bucketStart,
        bucketEndAt: new Date(bucketStart.getTime() + 60_000),
        valueKwh: 1,
        minKwh: 1,
        maxKwh: 1,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fp1 = computeHvChargingCounterObservationSetFingerprintV1(bucketsV1);
    await repository.persistBatch(
      basePersistInput(org.id, vehicle.id, segmentFingerprint, bucketStart, bucketsV1, fp1),
    );

    const bucketsV2 = [{ ...bucketsV1[0], valueKwh: 2, minKwh: 2, maxKwh: 2 }];
    const fp2 = computeHvChargingCounterObservationSetFingerprintV1(bucketsV2);
    const correctedInput = basePersistInput(
      org.id,
      vehicle.id,
      segmentFingerprint,
      bucketStart,
      bucketsV2,
      fp2,
    );

    const [left, right] = await Promise.all([
      repository.persistBatch(correctedInput),
      repository.persistBatch(correctedInput),
    ]);
    expect(left.batchId).toBe(right.batchId);
    expect(left.revisionsCreated + right.revisionsCreated).toBe(1);

    const revisions = await prisma.batteryHvChargingCounterObservation.findMany({
      where: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint,
        bucketStartAt: bucketStart,
      },
      orderBy: { revisionNumber: 'asc' },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2]);
    expect(revisions[1].supersedesObservationId).toBe(revisions[0].id);
  });

  it('tenant isolation: observations scoped to organization and vehicle', async () => {
    const suffix = randomUUID().slice(0, 8);
    const tenantA = await createTenantVehicle(prisma, `a-${suffix}`);
    const tenantB = await createTenantVehicle(prisma, `b-${suffix}`);
    const bucketStart = new Date('2026-10-16T16:00:00.000Z');
    const buckets = [
      {
        bucketStartAt: bucketStart,
        bucketEndAt: new Date(bucketStart.getTime() + 60_000),
        valueKwh: 3,
        minKwh: 3,
        maxKwh: 3,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fp = computeHvChargingCounterObservationSetFingerprintV1(buckets);
    const segment = `tenant-iso-${suffix}`;

    await repository.persistBatch(
      basePersistInput(tenantA.org.id, tenantA.vehicle.id, segment, bucketStart, buckets, fp),
    );
    await repository.persistBatch(
      basePersistInput(tenantB.org.id, tenantB.vehicle.id, segment, bucketStart, buckets, fp),
    );

    const aCount = await prisma.batteryHvChargingCounterObservation.count({
      where: { organizationId: tenantA.org.id, vehicleId: tenantA.vehicle.id, segmentFingerprint: segment },
    });
    const bCount = await prisma.batteryHvChargingCounterObservation.count({
      where: { organizationId: tenantB.org.id, vehicleId: tenantB.vehicle.id, segmentFingerprint: segment },
    });
    expect(aCount).toBe(1);
    expect(bCount).toBe(1);
  });

  it('accepts reduced-coverage provider response without new observation revisions', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `reduced-coverage-${suffix}`;
    const bucketStartA = new Date('2026-10-16T18:00:00.000Z');
    const bucketStartB = new Date('2026-10-16T18:01:00.000Z');
    const bucketsFull = [
      {
        bucketStartAt: bucketStartA,
        bucketEndAt: new Date(bucketStartA.getTime() + 60_000),
        valueKwh: 10,
        minKwh: 10,
        maxKwh: 10,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
      {
        bucketStartAt: bucketStartB,
        bucketEndAt: new Date(bucketStartB.getTime() + 60_000),
        valueKwh: 11,
        minKwh: 11,
        maxKwh: 11,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fpFull = computeHvChargingCounterObservationSetFingerprintV1(bucketsFull);
    await repository.persistBatch(
      basePersistInput(org.id, vehicle.id, segmentFingerprint, bucketStartA, bucketsFull, fpFull),
    );

    const bucketsReduced = [bucketsFull[0]];
    const fpReduced = computeHvChargingCounterObservationSetFingerprintV1(bucketsReduced);
    expect(fpReduced).not.toBe(fpFull);

    const reduced = await repository.persistBatch(
      basePersistInput(
        org.id,
        vehicle.id,
        segmentFingerprint,
        bucketStartA,
        bucketsReduced,
        fpReduced,
      ),
    );
    expect(reduced.created).toBe(true);
    expect(reduced.revisionsCreated).toBe(0);

    const observationCount = await prisma.batteryHvChargingCounterObservation.count({
      where: { organizationId: org.id, vehicleId: vehicle.id, segmentFingerprint },
    });
    expect(observationCount).toBe(2);
    const batchCount = await prisma.batteryHvChargingCounterIngestionBatch.count({
      where: { organizationId: org.id, vehicleId: vehicle.id, segmentFingerprint },
    });
    expect(batchCount).toBe(2);
  });

  it('persists revalidation checkpoint for provider-query anchor', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `checkpoint-${suffix}`;
    const queriedAt = new Date('2026-10-16T16:00:00.000Z');
    await repository.recordProviderRevalidationCheckpoint({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
      segmentStartAt: new Date('2026-10-16T13:15:02.931Z'),
      segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
      providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
      queriedAt,
      observationSetFingerprint: 'a'.repeat(64),
    });

    const row = await repository.findRevalidationCheckpoint({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
    });
    expect(row?.lastProviderQueryAt.toISOString()).toBe(queriedAt.toISOString());
  });

  it('does not leave orphan batch rows after failed transaction (empty-write guard)', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `rollback-${suffix}`;
    const bucketStart = new Date('2026-10-16T17:00:00.000Z');
    const buckets = [
      {
        bucketStartAt: bucketStart,
        bucketEndAt: new Date(bucketStart.getTime() + 60_000),
        valueKwh: 4,
        minKwh: 4,
        maxKwh: 4,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fp = computeHvChargingCounterObservationSetFingerprintV1(buckets);
    await repository.persistBatch(
      basePersistInput(org.id, vehicle.id, segmentFingerprint, bucketStart, buckets, fp),
    );

    const batchesBefore = await prisma.batteryHvChargingCounterIngestionBatch.count({
      where: { organizationId: org.id, vehicleId: vehicle.id, segmentFingerprint },
    });

    await expect(
      repository.persistBatch({
        ...basePersistInput(org.id, vehicle.id, segmentFingerprint, bucketStart, buckets, fp),
        observationSetFingerprint: `${fp}-mismatched`,
      }),
    ).rejects.toThrow('refusing empty observation write');

    const batchesAfter = await prisma.batteryHvChargingCounterIngestionBatch.count({
      where: { organizationId: org.id, vehicleId: vehicle.id, segmentFingerprint },
    });
    expect(batchesAfter).toBe(batchesBefore);
  });
});
