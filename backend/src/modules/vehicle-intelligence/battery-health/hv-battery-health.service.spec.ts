import { BatteryEvidenceScope, BatteryEvidenceSourceType, BatteryEvidenceValueType } from '@prisma/client';
import { HvBatteryHealthService } from './hv-battery-health.service';
import { BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV } from '../../../config/battery-health-v2.config';

describe('HvBatteryHealthService legacy pairwise capacity deprecation', () => {
  const vehicleId = 'veh-ev-1';
  const now = new Date('2026-07-15T10:00:00.000Z');

  const buildService = () => {
    const prisma = {
      vehicle: { findUnique: jest.fn() },
      vehicleLatestState: { findUnique: jest.fn() },
      hvBatteryHealthSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      hvBatteryHealthCurrent: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    const batteryEvidence = {
      getLatest: jest.fn().mockResolvedValue(null),
      recordMany: jest.fn(),
    } as any;
    const svc = new HvBatteryHealthService(prisma, batteryEvidence);
    return { svc, prisma, batteryEvidence };
  };

  const originalFlag = process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalFlag === undefined) {
      delete process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV];
    } else {
      process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = originalFlag;
    }
  });

  it('does not derive capacity from adjacent snapshots when legacy pairwise is disabled', async () => {
    process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = 'false';
    const { svc, prisma, batteryEvidence } = buildService();

    prisma.vehicle.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      fuelType: 'ELECTRIC',
      hvBatteryCapacityKwh: 75,
    });
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue({
      socPercent: 40,
      energyUsedKwh: 20,
      energyObservedAt: new Date('2026-07-15T09:59:30.000Z'),
      isCharging: false,
      chargingCableConnected: false,
      providerSohPercent: null,
      recordedAt: new Date('2026-07-15T09:59:30.000Z'),
      providerReceivedAt: new Date('2026-07-15T09:59:00.000Z'),
      idempotencyKey: 'hv-snap:prev',
    });
    prisma.hvBatteryHealthSnapshot.create.mockImplementation(async ({ data }: any) => ({
      id: 'snap-1',
      ...data,
      recordedAt: data.recordedAt ?? now,
    }));

    const upsertSpy = jest.spyOn(svc as any, 'upsertPublicationState').mockResolvedValue(undefined);

    await svc.recordSnapshot({
      vehicleId,
      socPercent: 60,
      energyUsedKwh: 35,
      rangeKm: 220,
      chargingPowerKw: 11,
      isCharging: true,
      temperatureC: 24,
      nominalCapacityKwh: 75,
      providerReportedSohPercent: 91,
      observedAt: now,
    });

    expect(prisma.hvBatteryHealthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimatedCapacityKwh: null,
          sohPercent: null,
          socPercent: 60,
          energyUsedKwh: 35,
          rangeKm: 220,
        }),
      }),
    );
    expect(batteryEvidence.recordMany).toHaveBeenCalledWith(
      expect.not.arrayContaining([
        expect.objectContaining({
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.MODEL_DERIVED,
        }),
      ]),
    );
    expect(batteryEvidence.recordMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          scope: BatteryEvidenceScope.HV,
          valueType: BatteryEvidenceValueType.SOC_PERCENT,
        }),
        expect.objectContaining({
          valueType: BatteryEvidenceValueType.CURRENT_ENERGY_KWH,
        }),
        expect.objectContaining({
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
          numericValue: 91,
        }),
      ]),
    );
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('uses per-signal provider timestamps for evidence instead of a single fetch time', async () => {
    process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = 'false';
    const { svc, prisma, batteryEvidence } = buildService();

    prisma.vehicle.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      fuelType: 'ELECTRIC',
      hvBatteryCapacityKwh: 57,
    });
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.hvBatteryHealthSnapshot.create.mockImplementation(async ({ data }: any) => ({
      id: 'snap-ts',
      ...data,
    }));

    const socAt = new Date('2026-07-16T12:59:35.000Z');
    const energyAt = new Date('2026-07-16T12:59:14.000Z');

    await svc.recordSnapshot({
      vehicleId,
      socPercent: 73.82,
      currentEnergyKwh: 41.38,
      collectionObservedAt: new Date('2026-07-16T13:00:08.000Z'),
      signalObservedAt: {
        soc: socAt,
        currentEnergyKwh: energyAt,
      },
    });

    expect(batteryEvidence.recordMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          valueType: BatteryEvidenceValueType.SOC_PERCENT,
          observedAt: socAt,
        }),
        expect.objectContaining({
          valueType: BatteryEvidenceValueType.CURRENT_ENERGY_KWH,
          numericValue: 41.38,
          observedAt: energyAt,
        }),
      ]),
    );
    expect(prisma.hvBatteryHealthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recordedAt: socAt,
          energyUsedKwh: 41.38,
        }),
      }),
    );
  });

  it('keeps provider SOH and live telemetry in status read when legacy pairwise is disabled', async () => {
    process.env[BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENV] = 'false';
    const { svc, prisma, batteryEvidence } = buildService();

    prisma.vehicle.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      fuelType: 'ELECTRIC',
      hvBatteryCapacityKwh: 75,
    });
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      evSoc: 66,
      rangeKm: 278,
      tractionBatterySohPercent: 88,
      tractionBatteryTemperatureC: 24,
      tractionBatteryChargingPowerKw: 11,
      tractionBatteryIsCharging: true,
      tractionBatteryChargingCableConnected: true,
      tractionBatteryCurrentVoltage: 351,
      tractionBatteryGrossCapacityKwh: 76,
      tractionBatteryCurrentEnergyKwh: 50,
      tractionBatteryAddedEnergyKwh: 6,
      tractionBatteryChargeLimitPercent: 100,
      lastSeenAt: now,
    });
    prisma.hvBatteryHealthSnapshot.findMany.mockResolvedValue([
      {
        socPercent: 65,
        energyUsedKwh: 48,
        estimatedCapacityKwh: 70,
        sohPercent: 93,
        rangeKm: 270,
        chargingPowerKw: 0,
        isCharging: false,
        odometerKm: 12000,
        recordedAt: new Date('2026-07-15T09:00:00.000Z'),
      },
    ]);
    prisma.hvBatteryHealthCurrent.findUnique.mockResolvedValue({
      publishedSohPct: 85,
      publicationState: 'STABLE',
      publicationMethod: 'capacity_measurement',
      maturityConfidence: 'high',
      validEstimateCount: 10,
    });
    batteryEvidence.getLatest.mockResolvedValue({
      numericValue: 88,
      observedAt: now,
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
    });

    const status = await svc.getHvBatteryStatus(vehicleId);

    expect(status?.currentSocPercent).toBe(66);
    expect(status?.estimatedRangeKm).toBe(278);
    expect(status?.telemetry.currentEnergyKwh).toBe(50);
    expect(status?.telemetry.isCharging).toBe(true);
    expect(status?.sohPercent).toBe(88);
    expect(status?.sohMethod).toBe('provider_reported_soh');
    expect(status?.legacyCapacity?.displayMode).toBe('LEGACY_UNVERIFIED');
    expect(status?.legacyCapacity?.diagnosticEstimatedCapacityKwh).toBe(70);
    expect(status?.publishedSohPercent).toBeNull();
  });
});
