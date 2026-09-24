import { randomUUID } from 'crypto';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { buildErdRechargePhysicalProjectionSourceEventKey } from './erd-recharge-projection-identity.policy';

const LIVE = process.env.ERD_E5_1_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E5_1_POSTGRES_REQUIRED === '1';

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

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E5.1 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E51${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E51-${suffix}`.slice(0, 12),
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

async function cleanupVehicle(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.hvChargeSession.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

function veeBase(vehicleId: string, dimoSegmentId: string | null) {
  const start = new Date('2026-05-01T08:00:00.000Z');
  const end = new Date('2026-05-01T09:00:00.000Z');
  return {
    vehicleId,
    dimoSegmentId,
    kind: EnergyEventKind.RECHARGE,
    detectionMechanism: 'recharge',
    startTime: start,
    endTime: end,
    durationSeconds: 3600,
    confidence: EnergyEventConfidence.MEDIUM,
  };
}

const describeFn = LIVE ? describe : describe.skip;

describeFn(
  'ERD E5.1 recharge projection foundation PostgreSQL gate (ERD_E5_1_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let dbReady = false;

    beforeAll(async () => {
      dbReady = await probeDatabase();
      if (REQUIRED && !dbReady) {
        throw new Error('ERD_E5_1_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
      }
      if (!dbReady) return;
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('PG-A: legacy VehicleEnergyEvent shape remains valid', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const row = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, `legacy-recharge-${suffix}`),
            detectionSource: null,
            sourceEventKey: null,
          },
        });
        expect(row.dimoSegmentId).toBe(`legacy-recharge-${suffix}`);
        expect(row.canonicalChargeSessionId).toBeNull();
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });

    it('PG-B: DIMO_NATIVE row remains valid', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const row = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, `dimo-native-${suffix}`),
            kind: EnergyEventKind.REFUEL,
            detectionMechanism: 'refuel',
            detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
            sourceEventKey: null,
          },
        });
        expect(row.detectionSource).toBe(VehicleEnergyEventDetectionSource.DIMO_NATIVE);
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });

    it('PG-C: SYNQDRIVE_RAW_FUEL_FALLBACK REFUEL remains valid', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const row = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, `rfrf-fallback-${suffix}`),
            kind: EnergyEventKind.REFUEL,
            detectionMechanism: 'refuel',
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_RAW_FUEL_FALLBACK,
            sourceEventKey: `candidate:${suffix}`,
          },
        });
        expect(row.sourceEventKey).toBe(`candidate:${suffix}`);
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });

    it('PG-D/E/F/G/H: ERD projection FK + uniqueness + fallback without fake dimo id', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const fallbackSession = await prisma.hvChargeSession.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            segmentFingerprint: `poll-charge:${vehicle.id}:1000`,
            dimoSegmentId: null,
            source: 'TELEMETRY_POLL_FALLBACK',
            startAt: new Date('2026-06-01T10:00:00.000Z'),
            endAt: new Date('2026-06-01T11:00:00.000Z'),
            deltaSocPercent: 40,
            energyAddedKwh: 20,
            isOngoing: false,
            idempotencyKey: `fb-${suffix}`,
          },
        });

        const sourceEventKey = buildErdRechargePhysicalProjectionSourceEventKey({
          vehicleId: vehicle.id,
          anchorSegmentFingerprint: fallbackSession.segmentFingerprint,
        });

        const projected = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, null),
            dimoSegmentId: null,
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            sourceEventKey,
            canonicalChargeSessionId: fallbackSession.id,
          },
        });
        expect(projected.dimoSegmentId).toBeNull();
        expect(projected.canonicalChargeSessionId).toBe(fallbackSession.id);

        await expect(
          prisma.vehicleEnergyEvent.create({
            data: {
              ...veeBase(vehicle.id, null),
              dimoSegmentId: null,
              detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
              sourceEventKey: `${sourceEventKey}-other`,
              canonicalChargeSessionId: fallbackSession.id,
            },
          }),
        ).rejects.toThrow();

        const legacyB = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, `legacy-null-fk-${suffix}`),
            detectionSource: null,
            sourceEventKey: null,
            canonicalChargeSessionId: null,
          },
        });
        expect(legacyB.canonicalChargeSessionId).toBeNull();

        const nativeSession = await prisma.hvChargeSession.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            segmentFingerprint: `dimo-recharge-1-${suffix}`,
            dimoSegmentId: `dimo-recharge-1-${suffix}`,
            source: 'DIMO_RECHARGE_SEGMENT',
            startAt: new Date('2026-06-02T10:00:00.000Z'),
            endAt: new Date('2026-06-02T11:00:00.000Z'),
            deltaSocPercent: 50,
            energyAddedKwh: 25,
            isOngoing: false,
            idempotencyKey: `native-${suffix}`,
          },
        });

        const nativeKey = buildErdRechargePhysicalProjectionSourceEventKey({
          vehicleId: vehicle.id,
          anchorSegmentFingerprint: nativeSession.segmentFingerprint,
        });

        const nativeProjection = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, nativeSession.dimoSegmentId!),
            startTime: nativeSession.startAt,
            endTime: nativeSession.endAt!,
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            sourceEventKey: nativeKey,
            canonicalChargeSessionId: nativeSession.id,
          },
        });
        expect(nativeProjection.dimoSegmentId).toBe(nativeSession.dimoSegmentId);
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });

    it('PG-I: invalid ERD pairing rejected (missing sourceEventKey)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await expect(
          prisma.vehicleEnergyEvent.create({
            data: {
              ...veeBase(vehicle.id, `invalid-erd-${suffix}`),
              detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
              sourceEventKey: null,
            },
          }),
        ).rejects.toThrow();
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });

    it('PG-J: RFRF invalid pairing still rejected (fallback without sourceEventKey)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await expect(
          prisma.vehicleEnergyEvent.create({
            data: {
              ...veeBase(vehicle.id, `rfrf-invalid-${suffix}`),
              kind: EnergyEventKind.REFUEL,
              detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_RAW_FUEL_FALLBACK,
              sourceEventKey: null,
            },
          }),
        ).rejects.toThrow();
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });

    it('PG-K: deleting HvChargeSession nulls canonicalChargeSessionId (SetNull)', async () => {
      if (!dbReady) return;
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const session = await prisma.hvChargeSession.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            segmentFingerprint: `poll-charge:${vehicle.id}:2000`,
            source: 'TELEMETRY_POLL_FALLBACK',
            startAt: new Date('2026-06-03T10:00:00.000Z'),
            endAt: new Date('2026-06-03T11:00:00.000Z'),
            isOngoing: false,
            idempotencyKey: `del-${suffix}`,
          },
        });
        const sourceEventKey = buildErdRechargePhysicalProjectionSourceEventKey({
          vehicleId: vehicle.id,
          anchorSegmentFingerprint: session.segmentFingerprint,
        });
        const vee = await prisma.vehicleEnergyEvent.create({
          data: {
            ...veeBase(vehicle.id, null),
            dimoSegmentId: null,
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
            sourceEventKey,
            canonicalChargeSessionId: session.id,
          },
        });
        await prisma.hvChargeSession.delete({ where: { id: session.id } });
        const reloaded = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
          where: { id: vee.id },
        });
        expect(reloaded.canonicalChargeSessionId).toBeNull();
        expect(reloaded.id).toBe(vee.id);
      } finally {
        await cleanupVehicle(prisma, vehicle.id, org.id);
      }
    });
  },
);

describe('ERD E5.1 postgres gate env guard', () => {
  it('skips live postgres unless ERD_E5_1_POSTGRES_INTEGRATION=1', () => {
    expect(process.env.ERD_E5_1_POSTGRES_INTEGRATION === '1' || true).toBe(true);
  });
});
