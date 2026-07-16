import {
  BatteryDriveProfile,
  BatteryChemistry,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from '../battery-health/battery-v2-domain';
import {
  guardLvMeasurementQualityForProfile,
  resolveDriveProfile,
  resolveFromCanonicalSpec,
  resolveFromProvider,
  resolveFromTelemetryHeuristic,
  resolveFromVehicleMaster,
} from './drive-profile-resolver';
import { DriveProfileSource } from './drive-profile-resolver.types';

describe('resolveDriveProfile', () => {
  it('resolves ICE from confirmed vehicle master fuel type', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'DIESEL' },
    });
    expect(result.profile).toBe(BatteryDriveProfile.ICE);
    expect(result.source).toBe(DriveProfileSource.VEHICLE_MASTER);
    expect(result.confidence).toBe('HIGH');
    expect(result.telemetryFallback).toBe(false);
  });

  it('resolves BEV from vehicle master electric fuel type', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'ELECTRIC' },
    });
    expect(result.profile).toBe(BatteryDriveProfile.BEV);
    expect(result.source).toBe(DriveProfileSource.VEHICLE_MASTER);
  });

  it('resolves PHEV from vehicle master plugin hybrid', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'PLUGIN_HYBRID' },
    });
    expect(result.profile).toBe(BatteryDriveProfile.PHEV);
  });

  it('resolves HEV from vehicle master hybrid fuel type', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'HYBRID' },
    });
    expect(result.profile).toBe(BatteryDriveProfile.HEV);
  });

  it('uses provider data when master fuel type is OTHER', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'OTHER' },
      provider: {
        vin: 'WVWZZZ3CZWE123456',
        providerPowertrainType: 'BEV',
      },
    });
    expect(result.profile).toBe(BatteryDriveProfile.BEV);
    expect(result.source).toBe(DriveProfileSource.PROVIDER_VIN);
  });

  it('resolves from canonical spec when master and provider are inconclusive', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'OTHER' },
      canonicalSpec: {
        hvBatteryCapacityKwh: 77,
        tankCapacityLiters: 45,
      },
    });
    expect(result.profile).toBe(BatteryDriveProfile.PHEV);
    expect(result.source).toBe(DriveProfileSource.CANONICAL_SPEC);
    expect(result.confidence).toBe('MEDIUM');
  });

  it('returns UNKNOWN for incomplete data without telemetry corroboration', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'OTHER' },
      telemetry: {
        tractionBatterySoc: true,
      },
    });
    expect(result.profile).toBe(BatteryDriveProfile.UNKNOWN);
    const telemetryLayer = resolveFromTelemetryHeuristic({
      tractionBatterySoc: true,
    });
    expect(telemetryLayer.evidence).toContain('telemetry:insufficient_corroboration');
  });

  it('uses telemetry heuristic only as last resort with clear marking', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'OTHER' },
      telemetry: {
        tractionBatterySoc: true,
        tractionBatteryEnergy: true,
        tractionBatteryCharging: true,
      },
    });
    expect(result.profile).toBe(BatteryDriveProfile.BEV);
    expect(result.source).toBe(DriveProfileSource.TELEMETRY_HEURISTIC);
    expect(result.telemetryFallback).toBe(true);
    expect(result.confidence).toBe('LOW');
  });

  it('returns UNKNOWN on master vs provider conflict', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'ELECTRIC' },
      provider: {
        providerFuelType: 'DIESEL',
        providerPowertrainType: 'ICE',
      },
    });
    expect(result.profile).toBe(BatteryDriveProfile.UNKNOWN);
    expect(result.evidence).toContain('conflict:master_vs_provider');
  });

  it('does not infer BEV from a single SOC telemetry signal', () => {
    const layer = resolveFromTelemetryHeuristic({
      tractionBatterySoc: true,
      lvBatteryVoltage: true,
    });
    expect(layer.profile).toBe(BatteryDriveProfile.UNKNOWN);
  });

  it('prefers vehicle master over telemetry heuristic', () => {
    const result = resolveDriveProfile({
      master: { fuelType: 'GASOLINE' },
      telemetry: {
        tractionBatterySoc: true,
        tractionBatteryEnergy: true,
      },
    });
    expect(result.profile).toBe(BatteryDriveProfile.ICE);
    expect(result.telemetryFallback).toBe(false);
  });
});

describe('guardLvMeasurementQualityForProfile', () => {
  it('downgrades BEV REST measurements to UNSUPPORTED_PROFILE', () => {
    const quality = guardLvMeasurementQualityForProfile({
      profile: BatteryDriveProfile.BEV,
      measurementType: BatteryMeasurementType.REST_60M,
      quality: BatteryMeasurementQuality.VALID,
    });
    expect(quality).toBe(BatteryMeasurementQuality.UNSUPPORTED_PROFILE);
  });

  it('allows BEV live LV voltage measurements when LV signal is present', () => {
    const quality = guardLvMeasurementQualityForProfile({
      profile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
      measurementType: BatteryMeasurementType.LIVE_VOLTAGE,
      quality: BatteryMeasurementQuality.VALID,
    });
    expect(quality).toBe(BatteryMeasurementQuality.VALID);
  });

  it('does not alter ICE REST measurements with known chemistry', () => {
    const quality = guardLvMeasurementQualityForProfile({
      profile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      measurementType: BatteryMeasurementType.REST_60M,
      quality: BatteryMeasurementQuality.VALID,
    });
    expect(quality).toBe(BatteryMeasurementQuality.VALID);
  });
});

describe('layer resolvers', () => {
  it('resolveFromProvider detects internal provider conflict', () => {
    const layer = resolveFromProvider({
      providerFuelType: 'ELECTRIC',
      providerPowertrainType: 'ICE',
    });
    expect(layer.profile).toBe(BatteryDriveProfile.UNKNOWN);
    expect(layer.evidence).toContain('provider:conflict_fuel_vs_powertrain');
  });

  it('resolveFromCanonicalSpec infers BEV from HV-only capacity', () => {
    const layer = resolveFromCanonicalSpec({ hvBatteryCapacityKwh: 60 });
    expect(layer.profile).toBe(BatteryDriveProfile.BEV);
  });

  it('resolveFromVehicleMaster honors explicit confirmed profile', () => {
    const layer = resolveFromVehicleMaster({
      fuelType: 'GASOLINE',
      confirmedDriveProfile: BatteryDriveProfile.PHEV,
    });
    expect(layer.profile).toBe(BatteryDriveProfile.PHEV);
    expect(layer.evidence).toContain('master:confirmed_drive_profile');
  });
});
