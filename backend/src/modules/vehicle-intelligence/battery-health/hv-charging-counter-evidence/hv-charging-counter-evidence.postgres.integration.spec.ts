import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HV_CHARGING_COUNTER_AVAILABILITY } from './hv-charging-counter-evidence.constants.v1';
import { computeHvChargingCounterObservationSetFingerprintV1 } from './hv-charging-counter-evidence.fingerprint.v1';
import { HvChargingCounterEvidenceRepository } from './hv-charging-counter-evidence.repository';

const LIVE = process.env.BATTERY_V2_HV_CHARGING_COUNTER_INTEGRATION === '1';

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

describe('HvChargingCounterEvidenceRepository (postgres)', () => {
  const prisma = new PrismaClient();
  const repository = new HvChargingCounterEvidenceRepository(prisma as unknown as PrismaService);

  beforeAll(async () => {
    if (!LIVE || !(await probeDatabase())) return;
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  (LIVE ? it : it.skip)('idempotent batch + corrected bucket revision chain', async () => {
    const suffix = randomUUID().slice(0, 8);
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
});
