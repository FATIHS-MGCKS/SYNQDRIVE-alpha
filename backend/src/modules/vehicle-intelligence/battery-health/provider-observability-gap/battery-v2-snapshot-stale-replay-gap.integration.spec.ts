import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryProviderObservabilityGapStatus,
  PrismaClient,
} from '@prisma/client';
import {
  BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV,
  BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import { BatteryProviderLastStoredLiveVoltageResolver } from '../battery-provider-last-stored-live-voltage.resolver';
import { BatteryV2SnapshotObservationProducer } from '../jobs/battery-v2-snapshot-observation.producer';
import { createBatteryV2JobProducer } from '../jobs/battery-v2-job-producer.test-util';
import { ProviderObservabilityGapRepository } from './provider-observability-gap.repository';
import { ProviderObservabilityGapService } from './provider-observability-gap.service';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

const LIVE = process.env.BATTERY_V2_PROVIDER_GAP_INTEGRATION === '1';

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

(LIVE ? describe : describe.skip)(
  'battery snapshot producer STALE_REPLAY → provider gap (PostgreSQL integration)',
  () => {
    let prisma: PrismaClient;
    let organizationId = '';
    let vehicleId = '';
    let measurementId = '';
    const originalGap = process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV];
    const originalGen = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

    beforeAll(async () => {
      if (!(await probeDatabase())) {
        throw new Error(
          'BATTERY_V2_PROVIDER_GAP_INTEGRATION=1 requires reachable DATABASE_URL',
        );
      }
      prisma = new PrismaClient();
    }, 120_000);

    afterAll(async () => {
      process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = originalGap;
      process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = originalGen;
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
      process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const org = await prisma.organization.create({
        data: {
          companyName: `Stale Replay Org ${suffix}`,
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });
      organizationId = org.id;
      vehicleId = randomUUID();
      const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
      const plate = `SR-${suffix}`;
      await prisma.$executeRaw`
        INSERT INTO vehicles (
          id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
          license_plate, created_at, updated_at
        ) VALUES (
          ${vehicleId}::uuid,
          ${organizationId}::uuid,
          ${vin},
          'Test',
          'ICE',
          2024,
          'GASOLINE'::"FuelType",
          'LTE_R1'::"HardwareType",
          'AVAILABLE'::"VehicleStatus",
          ${plate},
          NOW(),
          NOW()
        )
      `;

      await prisma.vehicleLatestState.create({
        data: {
          vehicleId,
          speedKmh: 45,
          isIgnitionOn: true,
          engineLoad: 20,
          online: true,
          lastSeenAt: new Date(),
          sourceTimestamp: new Date(),
          providerFetchedAt: new Date(),
        },
      });

      const T1 = new Date('2026-09-21T18:47:56.000Z');
      const T1Received = new Date('2026-09-21T18:47:58.000Z');
      const measurement = await prisma.batteryMeasurement.create({
        data: {
          organizationId,
          vehicleId,
          type: BatteryMeasurementType.LIVE_VOLTAGE,
          scope: BatteryEvidenceScope.LV,
          quality: BatteryMeasurementQuality.VALID,
          numericValue: 14.126,
          unit: 'V',
          observedAt: T1,
          receivedAt: T1Received,
          idempotencyKey: `meas:${randomUUID()}`,
        },
      });
      measurementId = measurement.id;

      await prisma.batteryHealthSnapshot.create({
        data: {
          vehicleId,
          voltageV: 14.126,
          recordedAt: T1,
        },
      });
    });

    afterEach(async () => {
      if (!organizationId) return;
      await prisma.batteryProviderObservabilityGap.deleteMany({ where: { organizationId } });
      await prisma.batteryGeneralizedEvidenceObservation.deleteMany({ where: { organizationId } });
      await prisma.batteryMeasurement.deleteMany({ where: { organizationId } });
      await prisma.batteryHealthSnapshot.deleteMany({ where: { vehicleId } });
      await prisma.vehicleLatestState.deleteMany({ where: { vehicleId } });
      await prisma.vehicle.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('TEST_REAL_PRODUCER_STALE_REPLAY_OPENS_GAP: producer path opens one OPEN gap without new measurement', async () => {
      const T1 = new Date('2026-09-21T18:47:56.000Z');
      const pollReceived = new Date(T1.getTime() + 6 * 60_000);

      const repository = new ProviderObservabilityGapRepository(prisma as never);
      const batteryPolicy = {
        resolveForVehicle: jest.fn().mockResolvedValue({ driveProfile: 'ICE' }),
      };
      const gapService = new ProviderObservabilityGapService(
        prisma as never,
        repository,
        batteryPolicy as never,
      );

      const queueAdd = jest.fn();
      const jobProducer = createBatteryV2JobProducer(
        {
          add: queueAdd,
          getJob: jest.fn().mockResolvedValue(null),
        } as never,
        { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
      );
      const lastStored = new BatteryProviderLastStoredLiveVoltageResolver(prisma as never);
      const producer = new BatteryV2SnapshotObservationProducer(
        prisma as never,
        jobProducer,
        lastStored,
        undefined,
        gapService,
      );

      const lvObservedAt = T1;
      const jobId = await producer.classifyAndEnqueue({
        organizationId,
        vehicleId,
        receivedAt: pollReceived,
        normalized: {
          lvBatteryVoltage: 14.126,
          evSoc: null,
          tractionBatteryCurrentEnergyKwh: null,
          tractionBatterySohPercent: null,
          tractionBatteryPowerKw: null,
          tractionBatteryChargingPowerKw: null,
          tractionBatteryAddedEnergyKwh: null,
          tractionBatteryChargeLimitPercent: null,
          tractionBatteryIsCharging: null,
          tractionBatteryChargingCableConnected: null,
          tractionBatteryTemperatureC: null,
          tractionBatteryGrossCapacityKwh: null,
          rangeKm: null,
          odometerKm: null,
        },
        batteryMap: {
          collectionLastSeenAt: lvObservedAt,
          lvBatteryVoltage: {
            dimoSignalName: 'lowVoltageBatteryCurrentVoltage',
            value: 14.126,
            sourceUnit: 'V',
            targetUnit: 'V',
            status: 'valid',
            observedAt: lvObservedAt,
          },
        } as never,
        lvBatteryObservedAt: lvObservedAt,
      });

      expect(jobId).toBeNull();
      expect(queueAdd).not.toHaveBeenCalled();

      const measurements = await prisma.batteryMeasurement.findMany({
        where: { organizationId, vehicleId, type: 'LIVE_VOLTAGE' },
      });
      expect(measurements).toHaveLength(1);
      expect(measurements[0].id).toBe(measurementId);

      const geRows = await prisma.batteryGeneralizedEvidenceObservation.findMany({
        where: { organizationId, vehicleId },
      });
      expect(geRows).toHaveLength(0);

      const openGaps = await prisma.batteryProviderObservabilityGap.findMany({
        where: {
          vehicleId,
          status: BatteryProviderObservabilityGapStatus.OPEN,
        },
      });
      expect(openGaps).toHaveLength(1);
      expect(openGaps[0].lastFreshProviderAt?.toISOString()).toBe(T1.toISOString());
      expect(openGaps[0].lastFreshObservationId).toBe(measurementId);
      expect(openGaps[0].staleSuccessfulPollCount).toBeGreaterThanOrEqual(1);
    });
  },
);
