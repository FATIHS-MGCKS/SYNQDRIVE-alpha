import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HV_CHARGING_COUNTER_AVAILABILITY } from './hv-charging-counter-evidence.constants.v1';
import { evaluateHvChargingCounterQualityV2 } from './hv-charging-counter-evidence.counter-quality.v2';
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

  it('persists counter quality JSON without altering bucket values', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `quality-json-${suffix}`;
    const bucketStart = new Date('2026-10-13T13:07:00.000Z');
    const buckets = [
      {
        bucketStartAt: bucketStart,
        bucketEndAt: new Date(bucketStart.getTime() + 60_000),
        valueKwh: 0.02,
        minKwh: 0.02,
        maxKwh: 0.02,
        availability: HV_CHARGING_COUNTER_AVAILABILITY.AVAILABLE,
      },
    ];
    const fp = computeHvChargingCounterObservationSetFingerprintV1(buckets);
    const counterQuality = evaluateHvChargingCounterQualityV2({
      sessionStartInclusive: bucketStart.toISOString(),
      sessionEndInclusive: new Date('2026-10-13T16:12:09.193Z').toISOString(),
      queryFromInclusive: bucketStart.toISOString(),
      queryToInclusive: new Date('2026-10-13T16:12:09.193Z').toISOString(),
      rows: [
        {
          timestamp: bucketStart.toISOString(),
          addedKwhLast: 0.02,
          addedKwhMin: 0.02,
          addedKwhMax: 0.02,
        },
      ],
    });

    const written = await repository.persistBatch({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
      sourceHvChargeSessionId: null,
      dimoTokenId: 186946,
      queryWindowFrom: bucketStart,
      queryWindowTo: new Date('2026-10-13T16:12:09.193Z'),
      segmentStartAt: bucketStart,
      segmentEndAt: new Date('2026-10-13T16:12:09.193Z'),
      providerObservedAt: new Date('2026-10-13T16:12:09.193Z'),
      observationSetFingerprint: fp,
      buckets,
      counterQuality,
    });
    expect(written.created).toBe(true);

    const batch = await prisma.batteryHvChargingCounterIngestionBatch.findUnique({
      where: { id: written.batchId },
    });
    expect(batch?.counterQualityJson).toMatchObject({
      schemaVersion: 'hv-r22-counter-quality-v2',
      reliableSessionCounterDelta: true,
      temporalCoverage: {
        schemaVersion: 'hv-r22-counter-temporal-v1',
      },
    });
    const obs = await prisma.batteryHvChargingCounterObservation.findFirst({
      where: { batchId: written.batchId },
    });
    expect(obs?.valueKwh).toBe(0.02);
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

  it('checkpoint timestamps stay monotonic under concurrent out-of-order writes', async () => {
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await createTenantVehicle(prisma, suffix);
    const segmentFingerprint = `checkpoint-monotonic-${suffix}`;
    const later = new Date('2026-10-16T16:00:00.000Z');
    const earlier = new Date('2026-10-16T10:00:00.000Z');
    const fpLate = 'c'.repeat(64);
    const fpEarly = 'd'.repeat(64);

    const base = {
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
      segmentStartAt: new Date('2026-10-16T13:15:02.931Z'),
      segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
      providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
    };

    await Promise.all([
      repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: later,
        observationSetFingerprint: fpLate,
      }),
      repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: earlier,
        observationSetFingerprint: fpEarly,
      }),
    ]);

    const row = await repository.findRevalidationCheckpoint({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segmentFingerprint,
    });
    expect(row?.lastProviderQueryAt.toISOString()).toBe(later.toISOString());
    expect(row?.lastObservationSetFingerprint).toBe(fpLate);
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

  function checkpointBase(orgId: string, vehicleId: string, segmentFingerprint: string) {
    return {
      organizationId: orgId,
      vehicleId,
      segmentFingerprint,
      segmentStartAt: new Date('2026-10-16T13:15:02.931Z'),
      segmentEndAt: new Date('2026-10-16T19:52:53.932Z'),
      providerObservedAt: new Date('2026-10-16T19:52:53.932Z'),
    };
  }

  describe('recordProviderRevalidationCheckpoint P1.3 atomicity', () => {
    const later = new Date('2026-10-16T16:00:00.000Z');
    const earlier = new Date('2026-10-16T10:00:00.000Z');
    const mid = new Date('2026-10-16T13:00:00.000Z');

    it('sequential earlier then later advances checkpoint', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-seq-early-late-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      await repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: earlier,
        observationSetFingerprint: 'd'.repeat(64),
      });
      await repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: later,
        observationSetFingerprint: 'c'.repeat(64),
      });
      const row = await repository.findRevalidationCheckpoint({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: segment,
      });
      expect(row?.lastProviderQueryAt.toISOString()).toBe(later.toISOString());
      expect(row?.lastObservationSetFingerprint).toBe('c'.repeat(64));
    });

    it('sequential later then earlier preserves later checkpoint', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-seq-late-early-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      await repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: later,
        observationSetFingerprint: 'c'.repeat(64),
      });
      await repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: earlier,
        observationSetFingerprint: 'd'.repeat(64),
      });
      const row = await repository.findRevalidationCheckpoint({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: segment,
      });
      expect(row?.lastProviderQueryAt.toISOString()).toBe(later.toISOString());
      expect(row?.lastObservationSetFingerprint).toBe('c'.repeat(64));
    });

    it('concurrent later and earlier writes keep MAX(lastProviderQueryAt)', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-concurrent-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      await Promise.all([
        repository.recordProviderRevalidationCheckpoint({
          ...base,
          queriedAt: later,
          observationSetFingerprint: 'c'.repeat(64),
        }),
        repository.recordProviderRevalidationCheckpoint({
          ...base,
          queriedAt: earlier,
          observationSetFingerprint: 'd'.repeat(64),
        }),
      ]);
      const row = await repository.findRevalidationCheckpoint({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: segment,
      });
      expect(row?.lastProviderQueryAt.toISOString()).toBe(later.toISOString());
      expect(row?.lastObservationSetFingerprint).toBe('c'.repeat(64));
    });

    it('concurrent first insert race leaves a single monotonic row', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-first-insert-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      await Promise.all([
        repository.recordProviderRevalidationCheckpoint({
          ...base,
          queriedAt: mid,
          observationSetFingerprint: 'e'.repeat(64),
        }),
        repository.recordProviderRevalidationCheckpoint({
          ...base,
          queriedAt: later,
          observationSetFingerprint: 'c'.repeat(64),
        }),
      ]);
      const count = await prisma.batteryHvChargingCounterRevalidationCheckpoint.count({
        where: {
          organizationId: org.id,
          vehicleId: vehicle.id,
          segmentFingerprint: segment,
        },
      });
      expect(count).toBe(1);
      const row = await repository.findRevalidationCheckpoint({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: segment,
      });
      expect(row?.lastProviderQueryAt.getTime()).toBe(
        Math.max(mid.getTime(), later.getTime()),
      );
    });

    it('stress: many concurrent writes retain global max timestamp and matching fingerprint', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-stress-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      const stamps = [
        earlier,
        mid,
        later,
        new Date('2026-10-16T11:00:00.000Z'),
        new Date('2026-10-16T15:00:00.000Z'),
        new Date('2026-10-16T17:00:00.000Z'),
      ];
      const maxMs = Math.max(...stamps.map((d) => d.getTime()));
      const maxDate = stamps.find((d) => d.getTime() === maxMs)!;
      const maxFp = 'f'.repeat(64);

      await Promise.all(
        stamps.map((queriedAt, i) =>
          repository.recordProviderRevalidationCheckpoint({
            ...base,
            queriedAt,
            observationSetFingerprint:
              queriedAt.getTime() === maxMs ? maxFp : `${i}`.padStart(64, '0'),
          }),
        ),
      );

      const row = await repository.findRevalidationCheckpoint({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: segment,
      });
      expect(row?.lastProviderQueryAt.toISOString()).toBe(maxDate.toISOString());
      expect(row?.lastObservationSetFingerprint).toBe(maxFp);
    });

    it('equal timestamps sequential: second fingerprint wins (>= policy)', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-equal-ts-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      await repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: later,
        observationSetFingerprint: 'a'.repeat(64),
      });
      await repository.recordProviderRevalidationCheckpoint({
        ...base,
        queriedAt: later,
        observationSetFingerprint: 'b'.repeat(64),
      });
      const row = await repository.findRevalidationCheckpoint({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: segment,
      });
      expect(row?.lastObservationSetFingerprint).toBe('b'.repeat(64));
    });

    it('duplicate idempotent checkpoint write is stable', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await createTenantVehicle(prisma, suffix);
      const segment = `cp-dup-${suffix}`;
      const base = checkpointBase(org.id, vehicle.id, segment);
      const input = {
        ...base,
        queriedAt: later,
        observationSetFingerprint: 'c'.repeat(64),
      };
      const a = await repository.recordProviderRevalidationCheckpoint(input);
      const b = await repository.recordProviderRevalidationCheckpoint(input);
      expect(a.lastProviderQueryAt.toISOString()).toBe(b.lastProviderQueryAt.toISOString());
      expect(a.lastObservationSetFingerprint).toBe(b.lastObservationSetFingerprint);
    });

    it('tenant isolation for checkpoints', async () => {
      const suffix = randomUUID().slice(0, 8);
      const tenantA = await createTenantVehicle(prisma, `cpa-${suffix}`);
      const tenantB = await createTenantVehicle(prisma, `cpb-${suffix}`);
      const segment = `shared-segment-${suffix}`;
      await repository.recordProviderRevalidationCheckpoint({
        ...checkpointBase(tenantA.org.id, tenantA.vehicle.id, segment),
        queriedAt: later,
        observationSetFingerprint: 'c'.repeat(64),
      });
      await repository.recordProviderRevalidationCheckpoint({
        ...checkpointBase(tenantB.org.id, tenantB.vehicle.id, segment),
        queriedAt: earlier,
        observationSetFingerprint: 'd'.repeat(64),
      });
      const rowA = await repository.findRevalidationCheckpoint({
        organizationId: tenantA.org.id,
        vehicleId: tenantA.vehicle.id,
        segmentFingerprint: segment,
      });
      const rowB = await repository.findRevalidationCheckpoint({
        organizationId: tenantB.org.id,
        vehicleId: tenantB.vehicle.id,
        segmentFingerprint: segment,
      });
      expect(rowA?.lastProviderQueryAt.toISOString()).toBe(later.toISOString());
      expect(rowB?.lastProviderQueryAt.toISOString()).toBe(earlier.toISOString());
    });
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

    const corruptFingerprint =
      fp.slice(0, 63) + (fp.endsWith('a') ? 'b' : 'a');
    expect(corruptFingerprint).toHaveLength(64);
    expect(corruptFingerprint).not.toBe(fp);

    await expect(
      repository.persistBatch({
        ...basePersistInput(org.id, vehicle.id, segmentFingerprint, bucketStart, buckets, fp),
        observationSetFingerprint: corruptFingerprint,
      }),
    ).rejects.toThrow('refusing empty observation write');

    const batchesAfter = await prisma.batteryHvChargingCounterIngestionBatch.count({
      where: { organizationId: org.id, vehicleId: vehicle.id, segmentFingerprint },
    });
    expect(batchesAfter).toBe(batchesBefore);
  });
});
