import { BatteryEvidenceSourceType, SohPublicationState } from '@prisma/client';
import { CanonicalBatteryHealthService } from './canonical-battery-health.service';

describe('CanonicalBatteryHealthService', () => {
  const now = new Date('2026-04-13T10:00:00.000Z');

  const buildService = () => {
    const prisma = {
      vehicle: { findUnique: jest.fn() },
      vehicleLatestState: { findUnique: jest.fn() },
      vehicleBatterySpec: { findFirst: jest.fn() },
      vehicleServiceEvent: { findMany: jest.fn() },
    } as any;

    const batteryHealthService = {
      getLatest: jest.fn(),
      getSohTrend: jest.fn(),
    } as any;

    const batteryV2Service = {
      getV2Health: jest.fn(),
    } as any;

    const hvBatteryHealthService = {
      getHvBatteryStatus: jest.fn(),
    } as any;

    const batteryEvidenceService = {
      listRecent: jest.fn(),
      getLatest: jest.fn(),
    } as any;

    const svc = new CanonicalBatteryHealthService(
      prisma,
      batteryHealthService,
      batteryV2Service,
      hvBatteryHealthService,
      batteryEvidenceService,
    );

    prisma.vehicle.findUnique.mockResolvedValue({
      id: 'veh-1',
      fuelType: 'ELECTRIC',
      hvBatteryCapacityKwh: 76,
    });
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: now,
      lvBatteryVoltage: 12.4,
      evSoc: 66,
      rangeKm: 278,
      tractionBatterySohPercent: 82,
      tractionBatteryTemperatureC: 24,
      tractionBatteryChargingPowerKw: 11,
      tractionBatteryIsCharging: true,
      tractionBatteryChargingCableConnected: true,
      tractionBatteryCurrentVoltage: 351,
      tractionBatteryGrossCapacityKwh: 76,
      tractionBatteryCurrentEnergyKwh: 50,
      tractionBatteryAddedEnergyKwh: 6,
    });
    prisma.vehicleBatterySpec.findFirst.mockResolvedValue(null);
    prisma.vehicleServiceEvent.findMany.mockResolvedValue([]);

    batteryHealthService.getLatest.mockResolvedValue({
      voltageV: 12.5,
      sohPercent: 79,
      recordedAt: now,
      restingVoltage: 12.4,
      crankingVoltage: 10.8,
      chargingVoltage: 14.1,
      temperatureC: 20,
    });
    batteryHealthService.getSohTrend.mockResolvedValue([
      { recordedAt: new Date('2026-04-12T10:00:00.000Z'), sohPercent: 78, voltageV: 12.4 },
      { recordedAt: new Date('2026-04-13T10:00:00.000Z'), sohPercent: 79, voltageV: 12.5 },
    ]);

    batteryV2Service.getV2Health.mockResolvedValue({
      publicationState: SohPublicationState.STABLE,
      publishedSohPct: 80,
      maturityConfidence: 'high',
      qualifiedEventCount: 8,
      restObservationCount: 4,
      crankObservationCount: 3,
      firstUsableMeasurementAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    hvBatteryHealthService.getHvBatteryStatus.mockResolvedValue({
      publishedSohPercent: 75,
      rawSohPercent: 73,
      sohPercent: 75,
      sohMethod: 'capacity_measurement',
      maturityConfidence: 'medium',
      publicationState: SohPublicationState.STABLE,
      currentSocPercent: 66,
      estimatedRangeKm: 278,
      snapshotCount: 32,
      sohInterpretation: {
        label: 'Good',
        color: 'green',
        description: 'normal',
      },
      chargingSessions: [],
      recentTrend: [],
    });

    batteryEvidenceService.listRecent.mockResolvedValue([]);
    batteryEvidenceService.getLatest.mockResolvedValue(null);

    return {
      svc,
      batteryEvidenceService,
      batteryHealthService,
      batteryV2Service,
      hvBatteryHealthService,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('prefers fresh provider-reported HV SOH over modeled values', async () => {
    const { svc, batteryEvidenceService } = buildService();
    batteryEvidenceService.getLatest.mockResolvedValue({
      numericValue: 88,
      observedAt: now,
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.healthPercent).toBe(88);
    expect(summary?.hv.evidenceType).toBe('provider_reported');
    expect(summary?.hv.method).toBe('provider_reported_soh');
  });

  it('falls back to publication SOH when provider value is stale', async () => {
    const { svc, batteryEvidenceService } = buildService();
    batteryEvidenceService.getLatest.mockResolvedValue({
      numericValue: 88,
      observedAt: new Date('2026-01-01T10:00:00.000Z'),
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.healthPercent).toBe(75);
    expect(summary?.hv.method).toBe('capacity_measurement');
  });

  it('marks LV health as no_recent_data when latest evidence is stale', async () => {
    const { svc, batteryHealthService } = buildService();
    batteryHealthService.getLatest.mockResolvedValue({
      voltageV: 12.3,
      sohPercent: 77,
      recordedAt: new Date('2026-04-01T10:00:00.000Z'),
      restingVoltage: 12.3,
      crankingVoltage: 10.9,
      chargingVoltage: 14.0,
      temperatureC: 16,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.status).toBe('no_recent_data');
  });
});
