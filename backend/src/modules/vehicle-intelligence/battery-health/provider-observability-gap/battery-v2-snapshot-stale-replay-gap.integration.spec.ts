import { randomUUID } from 'crypto';
import {
  BatteryDriveProfile,
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
import { restoreProcessEnv } from '../testing/battery-v2-process-env.test-util';

const LIVE = process.env.BATTERY_V2_PROVIDER_GAP_INTEGRATION === '1';

function lvPollBatteryMap(lvObservedAt: Date) {
  const field = (value: number) => ({
    dimoSignalName: 'x',
    value,
    sourceUnit: 'percent' as const,
    targetUnit: 'percent',
    status: 'valid' as const,
    observedAt: lvObservedAt,
  });
  const boolField = (value: boolean) => ({
    dimoSignalName: 'x',
    value,
    status: 'valid' as const,
    observedAt: lvObservedAt,
  });
  return {
    collectionLastSeenAt: lvObservedAt,
    lvBatteryVoltage: {
      dimoSignalName: 'lowVoltageBatteryCurrentVoltage',
      value: 14.126,
      sourceUnit: 'V' as const,
      targetUnit: 'V',
      status: 'valid' as const,
      observedAt: lvObservedAt,
    },
    evSoc: field(72),
    tractionBatteryCurrentEnergyKwh: field(40),
    tractionBatterySohPercent: field(95),
    tractionBatteryPowerKw: field(0),
    tractionBatteryChargingPowerKw: field(0),
    tractionBatteryAddedEnergyKwh: field(0),
    tractionBatteryChargeLimitPercent: field(80),
    tractionBatteryCurrentVoltage: field(400),
    tractionBatteryTemperatureC: field(22),
    tractionBatteryGrossCapacityKwh: field(60),
    tractionBatteryIsCharging: boolField(false),
    tractionBatteryChargingCableConnected: boolField(false),
  };
}

function lvPollNormalized() {
  return {
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

/** Resilient migrate-only DBs may lag optional Prisma columns on vehicle_latest_states. */
async function ensureVehicleLatestStateColumnsForIntegration(prisma: PrismaClient): Promise<void> {
  const alters = [
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_power_kw double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_soh_percent double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_temperature_c double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_charging_power_kw double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_added_energy_kwh double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_is_charging boolean',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_charging_cable_connected boolean',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_current_voltage double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_gross_capacity_kwh double precision',
    'ALTER TABLE vehicle_latest_states ADD COLUMN IF NOT EXISTS traction_battery_current_energy_kwh double precision',
  ];
  for (const sql of alters) {
    await prisma.$executeRawUnsafe(sql);
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
      await ensureVehicleLatestStateColumnsForIntegration(prisma);
    }, 120_000);

    afterAll(async () => {
      restoreProcessEnv(BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV, originalGap);
      restoreProcessEnv(BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV, originalGen);
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

      await prisma.$executeRaw`
        INSERT INTO vehicle_latest_states (
          id, vehicle_id, source, online, speed_kmh, is_ignition_on, engine_load,
          last_seen_at, source_timestamp, provider_fetched_at, updated_at
        ) VALUES (
          ${randomUUID()}::text,
          ${vehicleId}::text,
          'dimo',
          true,
          45,
          true,
          20,
          NOW(),
          NOW(),
          NOW(),
          NOW()
        )
      `;

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
      await prisma.batteryRestSession.deleteMany({ where: { organizationId } });
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
        resolveForVehicle: jest
          .fn()
          .mockResolvedValue({ driveProfile: BatteryDriveProfile.ICE }),
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

      const measurementCountBefore = await prisma.batteryMeasurement.count({
        where: { organizationId, vehicleId, type: BatteryMeasurementType.LIVE_VOLTAGE },
      });
      expect(measurementCountBefore).toBe(1);

      const classifyResult = await producer.classify({
        organizationId,
        vehicleId,
        receivedAt: pollReceived,
        normalized: lvPollNormalized(),
        batteryMap: lvPollBatteryMap(lvObservedAt) as never,
        lvBatteryObservedAt: lvObservedAt,
      });

      expect(classifyResult.lvDecision?.outcome).toBe('STALE_REPLAY');
      expect(classifyResult.shouldEnqueue).toBe(false);

      const jobId = await producer.classifyAndEnqueue({
        organizationId,
        vehicleId,
        receivedAt: pollReceived,
        normalized: lvPollNormalized(),
        batteryMap: lvPollBatteryMap(lvObservedAt) as never,
        lvBatteryObservedAt: lvObservedAt,
      });

      expect(jobId).toBeNull();
      expect(queueAdd).not.toHaveBeenCalled();

      const measurements = await prisma.batteryMeasurement.findMany({
        where: { organizationId, vehicleId, type: 'LIVE_VOLTAGE' },
      });
      expect(measurements).toHaveLength(1);
      expect(measurements[0].id).toBe(measurementId);

      const measurementCountAfter = await prisma.batteryMeasurement.count({
        where: { organizationId, vehicleId, type: BatteryMeasurementType.LIVE_VOLTAGE },
      });
      expect(measurementCountAfter).toBe(1);

      const geRows = await prisma.batteryGeneralizedEvidenceObservation.findMany({
        where: { organizationId, vehicleId },
      });
      expect(geRows).toHaveLength(0);

      const restSessions = await prisma.batteryRestSession.count({
        where: { organizationId, vehicleId },
      });
      expect(restSessions).toBe(0);

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
