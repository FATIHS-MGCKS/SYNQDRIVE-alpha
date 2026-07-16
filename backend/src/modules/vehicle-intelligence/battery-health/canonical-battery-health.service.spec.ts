import { BatteryEvidenceSourceType, SohPublicationState } from '@prisma/client';
import { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import {
  ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
  ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
} from './battery-lv-semantics';

describe('CanonicalBatteryHealthService', () => {
  const now = new Date('2026-04-13T10:00:00.000Z');

  const buildService = () => {
    const prisma = {
      vehicle: { findUnique: jest.fn() },
      vehicleLatestState: { findUnique: jest.fn() },
      vehicleBatterySpec: { findMany: jest.fn() },
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
      getLatestAmongSources: jest.fn(),
    } as any;

    const startProxyDiagnostic = {
      getForVehicle: jest.fn().mockResolvedValue({
        vehicleId: 'veh-1',
        diagnosticOnly: true,
        featureEnabled: false,
        uiLabelDe: 'Startverhalten (geschätzt)',
        scoreWeightPercent: 0,
        availability: 'SUPPORTED',
        availabilityLabelDe: 'Diagnostisch verfügbar',
        operationalEffect: false,
        readinessEffect: false,
        alertEligible: false,
        taskEligible: false,
        operationalStatus: 'UNKNOWN',
        latestSession: null,
        measurements: [],
      }),
    };

    const svc = new CanonicalBatteryHealthService(
      prisma,
      batteryHealthService,
      batteryV2Service,
      hvBatteryHealthService,
      batteryEvidenceService,
      startProxyDiagnostic as any,
    );

    prisma.vehicle.findUnique.mockResolvedValue({
      id: 'veh-1',
      fuelType: 'ELECTRIC',
      hvBatteryCapacityKwh: 76,
    });
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: now,
      providerFetchedAt: now,
      sourceTimestamp: now,
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
    prisma.vehicleBatterySpec.findMany.mockResolvedValue([
      {
        batteryType: 'AGM',
        batteryAmpere: 70,
        batteryVolt: 12,
        sourceType: 'MANUAL',
        sourceConfidence: 0.8,
        createdAt: now,
      },
    ]);
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
      crankObservationCount: 0,
      firstUsableMeasurementAt: new Date('2026-03-15T10:00:00.000Z'),
      vOff60m: 12.62,
      vOff6h: 12.6,
      rest60mCapturedAt: new Date('2026-04-13T06:00:00.000Z'),
      rest6hCapturedAt: new Date('2026-04-13T09:00:00.000Z'),
      crankDrop: null,
      crankAt: new Date('2026-04-13T05:55:00.000Z'),
      scoredAt: now,
      lastPublishedAt: now,
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
    batteryEvidenceService.getLatestAmongSources.mockResolvedValue(null);

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
    expect(summary?.hv.dataQualityStatus).toBe('VERIFIED');
    expect(summary?.dataQuality?.status).toBeDefined();
  });

  it('does not fall back to legacy pairwise publication SOH when provider value is stale', async () => {
    const { svc, batteryEvidenceService } = buildService();
    batteryEvidenceService.getLatest.mockResolvedValue({
      numericValue: 88,
      observedAt: new Date('2026-01-01T10:00:00.000Z'),
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.healthPercent).toBeNull();
    expect(summary?.hv.status).toBe('estimate_unavailable');
    expect(summary?.hv.legacyCapacity?.displayMode).toBe('LEGACY_UNVERIFIED');
  });

  it('marks LV health as no_recent_data when both legacy snapshot and live state are stale', async () => {
    const { svc, batteryHealthService } = buildService();
    const staleDate = new Date('2026-04-01T10:00:00.000Z');
    batteryHealthService.getLatest.mockResolvedValue({
      voltageV: 12.3,
      sohPercent: 77,
      recordedAt: staleDate,
      restingVoltage: 12.3,
      crankingVoltage: 10.9,
      chargingVoltage: 14.0,
      temperatureC: 16,
    });

    const prisma = (svc as any).prisma;
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: staleDate,
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

    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.status).toBe('no_recent_data');
  });

  it('prefers fresher live LV voltage over a stale legacy resting snapshot', async () => {
    // Regression guard for the BMW X6 stale-first bug: a legacy resting
    // snapshot at 12.4 V from a previous rest window must not mask a fresh
    // 14.1 V live telemetry reading while the engine is running / the 12 V
    // battery is being charged.
    const { svc, batteryHealthService } = buildService();
    batteryHealthService.getLatest.mockResolvedValue({
      voltageV: 12.4,
      sohPercent: 79,
      recordedAt: new Date('2026-04-01T10:00:00.000Z'),
      restingVoltage: 12.4,
      crankingVoltage: null,
      chargingVoltage: null,
      temperatureC: 18,
      engineRunning: false,
    });

    const prisma = (svc as any).prisma;
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: now,
      lvBatteryVoltage: 14.1,
      evSoc: null,
      rangeKm: null,
      tractionBatterySohPercent: null,
      tractionBatteryTemperatureC: null,
      tractionBatteryChargingPowerKw: null,
      tractionBatteryIsCharging: null,
      tractionBatteryChargingCableConnected: null,
      tractionBatteryCurrentVoltage: null,
      tractionBatteryGrossCapacityKwh: null,
      tractionBatteryCurrentEnergyKwh: null,
      tractionBatteryAddedEnergyKwh: null,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.telemetry.voltageV).toBe(14.1);
    expect(summary?.lv.telemetry.voltageSource).toBe('live_telemetry');
    expect(summary?.lv.status).toBe('ready');
  });

  it('uses the legacy resting snapshot when the live state is older', async () => {
    const { svc, batteryHealthService } = buildService();
    batteryHealthService.getLatest.mockResolvedValue({
      voltageV: 12.6,
      sohPercent: 82,
      recordedAt: now,
      restingVoltage: 12.6,
      crankingVoltage: null,
      chargingVoltage: null,
      temperatureC: 18,
      engineRunning: false,
    });

    const prisma = (svc as any).prisma;
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: new Date('2026-04-10T10:00:00.000Z'),
      lvBatteryVoltage: 12.1,
      evSoc: null,
      rangeKm: null,
      tractionBatterySohPercent: null,
      tractionBatteryTemperatureC: null,
      tractionBatteryChargingPowerKw: null,
      tractionBatteryIsCharging: null,
      tractionBatteryChargingCableConnected: null,
      tractionBatteryCurrentVoltage: null,
      tractionBatteryGrossCapacityKwh: null,
      tractionBatteryCurrentEnergyKwh: null,
      tractionBatteryAddedEnergyKwh: null,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.telemetry.voltageV).toBe(12.6);
    expect(summary?.lv.telemetry.voltageSource).toBe('resting_snapshot');
  });

  it('exposes legacy crank diagnostically without operational effect by default', async () => {
    const { svc, batteryV2Service } = buildService();
    batteryV2Service.getV2Health.mockResolvedValue({
      publicationState: SohPublicationState.STABLE,
      publishedSohPct: 80,
      maturityConfidence: 'high',
      qualifiedEventCount: 8,
      restObservationCount: 4,
      crankObservationCount: 0,
      firstUsableMeasurementAt: new Date('2026-03-15T10:00:00.000Z'),
      vOff60m: 12.62,
      vOff6h: 12.6,
      rest60mCapturedAt: new Date('2026-04-13T06:00:00.000Z'),
      rest6hCapturedAt: new Date('2026-04-13T09:00:00.000Z'),
      crankDrop: 2.4,
      crankAt: new Date('2026-04-13T05:55:00.000Z'),
      scoredAt: now,
      lastPublishedAt: now,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.telemetry.crank?.diagnosticCrankDrop).toBe(2.4);
    expect(summary?.lv.telemetry.crank?.displayMode).toBe('LEGACY_UNVERIFIED');
    expect(summary?.lv.telemetry.crank?.decisionCapable).toBe(false);
    expect(summary?.lv.telemetry.crank?.operationalStatus).toBe('UNKNOWN');
  });

  it('exposes LV estimated health score semantics (no SOH label)', async () => {
    const { svc } = buildService();
    const summary = await svc.getSummary('veh-1');
    // Published V2 score 80 → GOOD → 3 bars when legacy publication is safety-qualified.
    expect(summary?.lv.estimatedHealth.status).toBe('GOOD');
    expect(summary?.lv.estimatedHealth.decisionCapable).toBe(true);
    expect(summary?.lv.legacyPublicationSafety?.decisionCapable).toBe(true);
    expect(summary?.lv.estimatedHealth.bars).toBe(3);
    expect(summary?.lv.estimatedHealth.displayMode).toBe('BARS');
    expect(summary?.lv.estimatedHealth.semanticType).toBe(ESTIMATED_LV_HEALTH_SCORE_SEMANTIC);
    expect(summary?.lv.estimatedHealth.label).toBe(ESTIMATED_LV_HEALTH_SCORE_LABEL_DE);
    expect(summary?.lv.estimatedLvHealthScore?.value).toBe(80);
    expect(summary?.lv.healthPercentSemantic).toBe('LEGACY_ESTIMATED_LV_HEALTH');
    expect(summary?.currentState?.sohPercentSemantic).toBe('LEGACY_ESTIMATED_LV_HEALTH');
    expect(summary?.currentState?.estimatedLvHealthScoreSemantic).toBe(
      ESTIMATED_LV_HEALTH_SCORE_SEMANTIC,
    );
  });

  it('excludes unsafe legacy publication from operational LV health status', async () => {
    const { svc, batteryV2Service } = buildService();
    batteryV2Service.getV2Health.mockResolvedValue({
      publicationState: SohPublicationState.STABLE,
      publishedSohPct: 35,
      maturityConfidence: 'high',
      qualifiedEventCount: 8,
      restObservationCount: 4,
      crankObservationCount: 0,
      firstUsableMeasurementAt: new Date('2026-03-15T10:00:00.000Z'),
      vOff60m: 14.43,
      vOff6h: 12.6,
      rest60mCapturedAt: new Date('2026-04-13T06:00:00.000Z'),
      rest6hCapturedAt: new Date('2026-04-13T09:00:00.000Z'),
      crankDrop: 1.1,
      crankAt: new Date('2026-04-13T05:55:00.000Z'),
      scoredAt: now,
      lastPublishedAt: now,
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.legacyPublicationSafety?.decisionCapable).toBe(false);
    expect(summary?.lv.estimatedHealth.diagnosticStatus).toBe('CRITICAL');
    expect(summary?.lv.estimatedHealth.status).toBe('UNKNOWN');
    expect(summary?.lv.healthStatus).not.toBe('CRITICAL');
  });

  it('classifies LV resting voltage with default (unknown battery type) bands', async () => {
    const { svc } = buildService();
    const prisma = (svc as any).prisma;
    prisma.vehicleBatterySpec.findMany.mockResolvedValue([]);
    // restingVoltage 12.4 with no battery spec → DEFAULT band → 12.2–12.49 = WATCH.
    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.restingVoltage.valueV).toBe(12.4);
    expect(summary?.lv.restingVoltage.status).toBe('WATCH');
    expect(summary?.lv.restingVoltage.thresholdSource).toBe('DEFAULT');
  });

  it('uses AGM bands from the battery spec for resting voltage', async () => {
    const { svc } = buildService();
    const prisma = (svc as any).prisma;
    prisma.vehicleBatterySpec.findMany.mockResolvedValue([
      {
        batteryType: 'AGM',
        batteryAmpere: 80,
        batteryVolt: 12,
        sourceType: 'MANUAL',
        sourceConfidence: 0.9,
        createdAt: now,
      },
    ]);
    const summary = await svc.getSummary('veh-1');
    // AGM: 12.4 is in 12.30–12.59 → WATCH, thresholdSource BATTERY_SPEC.
    expect(summary?.lv.restingVoltage.status).toBe('WATCH');
    expect(summary?.lv.restingVoltage.thresholdSource).toBe('BATTERY_SPEC');
    expect(summary?.lv.restingVoltage.batteryType).toBe('AGM');
  });

  it('reports HV SOH as unavailable when no reliable basis exists (no fake %)', async () => {
    const { svc, hvBatteryHealthService } = buildService();
    const prisma = (svc as any).prisma;
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: now,
      lvBatteryVoltage: 12.4,
      evSoc: 66,
      rangeKm: 278,
      tractionBatterySohPercent: null,
      tractionBatteryTemperatureC: 24,
      tractionBatteryChargingPowerKw: 11,
      tractionBatteryIsCharging: true,
      tractionBatteryChargingCableConnected: true,
      tractionBatteryCurrentVoltage: 351,
      tractionBatteryGrossCapacityKwh: 76,
      tractionBatteryCurrentEnergyKwh: 50,
      tractionBatteryAddedEnergyKwh: 6,
    });
    hvBatteryHealthService.getHvBatteryStatus.mockResolvedValue({
      publishedSohPercent: null,
      rawSohPercent: null,
      sohPercent: null,
      sohMethod: 'insufficient_data',
      maturityConfidence: 'none',
      publicationState: SohPublicationState.INITIAL_CALIBRATION,
      currentSocPercent: 66,
      estimatedRangeKm: 278,
      snapshotCount: 1,
      sohInterpretation: { label: 'Unknown', color: 'gray', description: '' },
      chargingSessions: [],
      recentTrend: [],
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.healthPercent).toBeNull();
    expect(summary?.hv.healthStatus).toBe('UNKNOWN');
    expect(summary?.hv.status).toBe('estimate_unavailable');
    expect(summary?.hv.sohSource).toBeNull();
    expect(summary?.hv.noFallbackSoh).toBe(true);
  });

  it('ignores legacy degradation_model HV SOH and does not publish it', async () => {
    const { svc, hvBatteryHealthService } = buildService();
    const prisma = (svc as any).prisma;
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: now,
      lvBatteryVoltage: 12.4,
      evSoc: 66,
      rangeKm: 278,
      tractionBatterySohPercent: null,
      tractionBatteryTemperatureC: 24,
      tractionBatteryChargingPowerKw: null,
      tractionBatteryIsCharging: false,
      tractionBatteryChargingCableConnected: false,
      tractionBatteryCurrentVoltage: 351,
      tractionBatteryGrossCapacityKwh: 76,
      tractionBatteryCurrentEnergyKwh: 50,
      tractionBatteryAddedEnergyKwh: null,
    });
    hvBatteryHealthService.getHvBatteryStatus.mockResolvedValue({
      publishedSohPercent: 72,
      rawSohPercent: 72,
      sohPercent: 72,
      sohMethod: 'degradation_model',
      maturityConfidence: 'low',
      publicationState: SohPublicationState.STABLE,
      currentSocPercent: 66,
      estimatedRangeKm: 278,
      snapshotCount: 40,
      sohInterpretation: { label: 'Estimated', color: 'amber', description: '' },
      chargingSessions: [],
      recentTrend: [],
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.healthPercent).toBeNull();
    expect(summary?.hv.healthStatus).toBe('UNKNOWN');
    expect(summary?.hv.status).toBe('estimate_unavailable');
  });

  it('selects the best battery spec by completeness, not just newest row', async () => {
    const { svc } = buildService();
    const prisma = (svc as any).prisma;
    prisma.vehicleBatterySpec.findMany.mockResolvedValue([
      {
        batteryType: null,
        batteryVolt: 12,
        batteryAmpere: null,
        sourceType: 'MANUAL',
        sourceConfidence: 1,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
      },
      {
        batteryType: 'EFB',
        batteryVolt: 12,
        batteryAmpere: 70,
        sourceType: 'MANUAL',
        sourceConfidence: 0.6,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
    ]);

    const summary = await svc.getSummary('veh-1');
    expect(summary?.specs?.batteryType).toBe('EFB');
    expect(summary?.lv.restingVoltage.thresholdSource).toBe('BATTERY_SPEC');
  });

  it('separates fresh fetch from stale provider SOH observation', async () => {
    const { svc, batteryEvidenceService, hvBatteryHealthService } = buildService();
    const freshFetch = new Date('2026-04-13T09:55:00.000Z');
    const staleObservation = new Date('2026-01-01T10:00:00.000Z');
    const prisma = (svc as any).prisma;
    prisma.vehicleLatestState.findUnique.mockResolvedValue({
      lastSeenAt: freshFetch,
      providerFetchedAt: freshFetch,
      sourceTimestamp: staleObservation,
      lvBatteryVoltage: 12.4,
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
    });
    batteryEvidenceService.getLatest.mockResolvedValue({
      numericValue: 88,
      observedAt: staleObservation,
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
    });
    hvBatteryHealthService.getHvBatteryStatus.mockResolvedValue({
      publishedSohPercent: null,
      rawSohPercent: null,
      sohPercent: null,
      sohMethod: 'insufficient_data',
      maturityConfidence: 'none',
      publicationState: SohPublicationState.INITIAL_CALIBRATION,
      currentSocPercent: 66,
      estimatedRangeKm: 278,
      snapshotCount: 1,
      sohInterpretation: { label: 'Unknown', color: 'gray', description: '' },
      chargingSessions: [],
      recentTrend: [],
    });

    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.fetchFreshness?.fetchState).toBe('FRESH');
    expect(summary?.hv.freshnessBundle?.providerSohFreshness?.observationState).toBe(
      'STALE',
    );
    expect(summary?.hv.freshness?.isFresh).toBe(false);
    expect(summary?.hv.healthPercent).toBeNull();
  });

  it('marks VLS-only provider SOH as missing timestamp without evidence observedAt', async () => {
    const { svc } = buildService();
    const summary = await svc.getSummary('veh-1');
    expect(summary?.hv.freshnessBundle?.providerSohFreshness?.observationState).toBe(
      'MISSING_TIMESTAMP',
    );
    expect(summary?.hv.fetchFreshness?.fetchState).toBe('FRESH');
  });

  it('exposes structured freshness on LV and currentTelemetry', async () => {
    const { svc } = buildService();
    const summary = await svc.getSummary('veh-1');
    expect(summary?.lv.fetchFreshness?.fetchState).toBe('FRESH');
    expect(summary?.lv.observationFreshness?.observationState).toBe('FRESH');
    expect(summary?.lv.freshnessBundle?.restMeasurementFreshness?.observationState).toBe(
      'FRESH',
    );
    expect(summary?.currentTelemetry.fetchFreshness?.fetchState).toBe('FRESH');
    expect(summary?.currentTelemetry.observationFreshness?.observationState).toBe(
      'FRESH',
    );
  });
});
