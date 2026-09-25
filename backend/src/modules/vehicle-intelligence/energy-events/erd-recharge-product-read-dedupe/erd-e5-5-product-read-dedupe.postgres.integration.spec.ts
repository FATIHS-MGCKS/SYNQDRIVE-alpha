import { randomUUID } from 'crypto';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EnergyEventsService } from '../energy-events.service';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';

const LIVE = process.env.ERD_E5_5_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E5_5_POSTGRES_REQUIRED === '1';

const SESSION_START = new Date('2026-06-01T10:00:00.000Z');
const SESSION_END = new Date('2026-06-01T11:00:00.000Z');

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E5.5 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E55${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E55-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'ERD',
      year: 2024,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.hvChargeSession.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

function buildService(client: PrismaClient) {
  return new EnergyEventsService(client as unknown as PrismaService, {} as never);
}

const describeFn = LIVE ? describe : describe.skip;

describeFn('ERD E5.5 product read dedupe PostgreSQL gate', () => {
  let prisma: PrismaClient;
  let dbReady = false;

  beforeAll(async () => {
    dbReady = await probeDatabase();
    if (REQUIRED && !dbReady) {
      throw new Error('ERD_E5_5_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
    }
    if (!dbReady) return;
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('R16: REFUEL canonical output unchanged when dedupe flag ON', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const service = buildService(prisma);
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.REFUEL,
        detectionMechanism: 'refuel',
        dimoSegmentId: `refuel-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.MEDIUM,
        fuelDeltaLiters: 20,
      },
    });
    const envOff = { ...process.env, ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '0' };
    const envOn = { ...process.env, ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1' };
    const off = await service.listCanonicalEnergyEvents(vehicle.id, {}, envOff);
    const on = await service.listCanonicalEnergyEvents(vehicle.id, {}, envOn);
    expect(off.filter((e) => e.kind === EnergyEventKind.REFUEL).length).toBe(
      on.filter((e) => e.kind === EnergyEventKind.REFUEL).length,
    );

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('R6: lineage duplicate suppression via listCanonicalEnergyEvents', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const service = buildService(prisma);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-child-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: SESSION_START,
        endAt: SESSION_END,
        deltaSocPercent: 20,
        energyAddedKwh: 10,
        isOngoing: false,
        idempotencyKey: `sess-${suffix}`,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        canonicalChargeSessionId: session.id,
        sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
        dimoSegmentId: `dimo-child-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.HIGH,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'recharge',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        dimoSegmentId: `dimo-coalesced-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.MEDIUM,
        rawDetectionMeta: {
          coalescedFromSegmentIds: [`dimo-child-${suffix}`],
        },
      },
    });

    const envOn = { ...process.env, ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1' };
    const canonical = await service.listCanonicalEnergyEvents(vehicle.id, {}, envOn);
    const recharges = canonical.filter((e) => e.kind === EnergyEventKind.RECHARGE);
    expect(recharges).toHaveLength(1);
    expect(recharges[0]!.detectionMechanism).toBe(ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('R7/R8: time-only and fallback-null-dimo fail-open (both visible)', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const service = buildService(prisma);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fb-${suffix}`,
        dimoSegmentId: null,
        source: 'TELEMETRY_POLL_FALLBACK',
        startAt: SESSION_START,
        endAt: SESSION_END,
        deltaSocPercent: 15,
        energyAddedKwh: 8,
        isOngoing: false,
        idempotencyKey: `fb-${suffix}`,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        canonicalChargeSessionId: session.id,
        sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
        dimoSegmentId: null,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.HIGH,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'recharge',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        dimoSegmentId: `legacy-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.MEDIUM,
      },
    });

    const envOn = { ...process.env, ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1' };
    const canonical = await service.listCanonicalEnergyEvents(vehicle.id, {}, envOn);
    expect(canonical.filter((e) => e.kind === EnergyEventKind.RECHARGE)).toHaveLength(2);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('R18/R19: raw and forensic reads return all persisted rows', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const service = buildService(prisma);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: SESSION_START,
        endAt: SESSION_END,
        deltaSocPercent: 20,
        energyAddedKwh: 10,
        isOngoing: false,
        idempotencyKey: `sess-${suffix}`,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        canonicalChargeSessionId: session.id,
        sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
        dimoSegmentId: `dimo-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.HIGH,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'recharge',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        dimoSegmentId: `dimo-coalesced-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.MEDIUM,
        rawDetectionMeta: {
          coalescedFromSegmentIds: [`dimo-${suffix}`],
        },
      },
    });

    const envOn = { ...process.env, ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1' };
    const raw = await service.listEnergyEventsRaw(vehicle.id, {});
    const forensic = await service.listEnergyEvents(vehicle.id, {});
    expect(raw.filter((e) => e.kind === EnergyEventKind.RECHARGE)).toHaveLength(2);
    expect(forensic.filter((e) => e.kind === EnergyEventKind.RECHARGE)).toHaveLength(2);

    const canonical = await service.listCanonicalEnergyEvents(vehicle.id, {}, envOn);
    expect(canonical.filter((e) => e.kind === EnergyEventKind.RECHARGE)).toHaveLength(1);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('R22–R24: canonical read causes zero VEE/HV/shadow writes', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const service = buildService(prisma);
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'recharge',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        dimoSegmentId: `only-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.MEDIUM,
      },
    });

    const veeBefore = await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } });
    const hvBefore = await prisma.hvChargeSession.count({ where: { vehicleId: vehicle.id } });
    const shadowBefore = await prisma.erdRechargeProjectionShadowObservation.count({
      where: { vehicleId: vehicle.id },
    });

    await service.listCanonicalEnergyEvents(vehicle.id, {}, {
      ...process.env,
      ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
    });

    expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(
      veeBefore,
    );
    expect(await prisma.hvChargeSession.count({ where: { vehicleId: vehicle.id } })).toBe(
      hvBefore,
    );
    expect(
      await prisma.erdRechargeProjectionShadowObservation.count({ where: { vehicleId: vehicle.id } }),
    ).toBe(shadowBefore);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('R20/R21: Trips timeline dedupes when ON and preserves when OFF', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const service = buildService(prisma);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: SESSION_START,
        endAt: SESSION_END,
        deltaSocPercent: 20,
        energyAddedKwh: 10,
        isOngoing: false,
        idempotencyKey: `sess-${suffix}`,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        canonicalChargeSessionId: session.id,
        sourceEventKey: `erd:physical:v1:${vehicle.id}:${session.segmentFingerprint}`,
        dimoSegmentId: `dimo-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.HIGH,
      },
    });
    await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'recharge',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        dimoSegmentId: `dimo-coalesced-${suffix}`,
        startTime: SESSION_START,
        endTime: SESSION_END,
        durationSeconds: 3600,
        confidence: EnergyEventConfidence.MEDIUM,
        rawDetectionMeta: {
          coalescedFromSegmentIds: [`dimo-${suffix}`],
        },
      },
    });

    const offTimeline = await service.buildTripsTimeline(vehicle.id, [], {}, {
      ...process.env,
      ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '0',
    });
    const onTimeline = await service.buildTripsTimeline(vehicle.id, [], {}, {
      ...process.env,
      ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1',
    });
    const offRecharges = offTimeline.filter(
      (i) => i.itemType === 'energy-event' && i.kind === EnergyEventKind.RECHARGE,
    );
    const onRecharges = onTimeline.filter(
      (i) => i.itemType === 'energy-event' && i.kind === EnergyEventKind.RECHARGE,
    );
    expect(offRecharges).toHaveLength(2);
    expect(onRecharges).toHaveLength(1);

    await cleanup(prisma, vehicle.id, org.id);
  });
});
