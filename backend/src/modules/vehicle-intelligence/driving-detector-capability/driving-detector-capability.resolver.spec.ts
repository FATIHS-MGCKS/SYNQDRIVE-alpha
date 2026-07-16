import { DrivingCapabilityStatus, HardwareType } from '@prisma/client';
import type { ResolvedVehicleDrivingCapability } from '../driving-capability/vehicle-driving-capability.types';
import { DIMO_CAPABILITY_PREFLIGHT_VERSION } from '../driving-capability/dimo-preflight-classifier.config';
import {
  getDetectorCapability,
  resolveDrivingDetectorCapabilities,
} from './driving-detector-capability.resolver';
import { DRIVING_DETECTOR_CAPABILITY_VERSION } from './driving-detector-capability.types';
import { buildTripAssessabilityCapabilitySnapshot } from './trip-assessability-detector-bridge';

function cap(
  key: string,
  status: DrivingCapabilityStatus,
  extras: Partial<ResolvedVehicleDrivingCapability> = {},
): ResolvedVehicleDrivingCapability {
  const isEvent = key.startsWith('behavior.') || key === 'safety.collision';
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    providerSource: 'DIMO_TELEMETRY',
    capabilityKey: key,
    signalName: isEvent || key === 'dimo-trip-segments' ? (isEvent ? key : null) : key,
    detectorName: key === 'dimo-trip-segments' ? key : null,
    capabilityStatus: status,
    nativeEventAvailable: extras.nativeEventAvailable ?? false,
    hardwareProfile: 'LTE_R1',
    effectiveCadenceMs: extras.effectiveCadenceMs ?? null,
    p95CadenceMs: extras.p95CadenceMs ?? null,
    coverage: extras.coverage ?? null,
    checkedAt: new Date('2026-07-16T10:00:00Z'),
    resolutionSource: 'persisted',
    row: {
      capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
    } as any,
    ...extras,
  };
}

/** Audit LTE_R1 ICE baseline — 14 signals, no chassis/transmission native events. */
const LTE_R1_ICE_CAPABILITIES: ResolvedVehicleDrivingCapability[] = [
  cap('powertrainCombustionEngineSpeed', DrivingCapabilityStatus.SUPPORTED, {
    effectiveCadenceMs: 8000,
    p95CadenceMs: 15000,
    coverage: 0.85,
  }),
  cap('obdThrottlePosition', DrivingCapabilityStatus.SUPPORTED, {
    effectiveCadenceMs: 8000,
    coverage: 0.85,
  }),
  cap('obdEngineLoad', DrivingCapabilityStatus.SUPPORTED, {
    effectiveCadenceMs: 8000,
    coverage: 0.85,
  }),
  cap('powertrainCombustionEngineECT', DrivingCapabilityStatus.SUPPORTED),
  cap('obdRunTime', DrivingCapabilityStatus.SUPPORTED),
  cap('speed', DrivingCapabilityStatus.SUPPORTED, { effectiveCadenceMs: 5000 }),
  cap('powertrainTransmissionTravelledDistance', DrivingCapabilityStatus.SUPPORTED),
  cap('behavior.harshAcceleration', DrivingCapabilityStatus.SUPPORTED, {
    nativeEventAvailable: true,
  }),
  cap('behavior.harshBraking', DrivingCapabilityStatus.UNSUPPORTED),
  cap('behavior.harshCornering', DrivingCapabilityStatus.UNSUPPORTED),
  cap('dimo-trip-segments', DrivingCapabilityStatus.SUPPORTED, { detectorName: 'dimo-trip-segments', signalName: null }),
  cap('powertrainTransmissionCurrentGear', DrivingCapabilityStatus.UNSUPPORTED),
  cap('chassisBrakeIsPedalPressed', DrivingCapabilityStatus.UNSUPPORTED),
  cap('angularVelocityYaw', DrivingCapabilityStatus.UNSUPPORTED),
];

/** Tesla EV — no native behavior, battery power only. */
const LTE_R1_EV_CAPABILITIES: ResolvedVehicleDrivingCapability[] = [
  cap('speed', DrivingCapabilityStatus.SUPPORTED),
  cap('powertrainTractionBatteryCurrentPower', DrivingCapabilityStatus.SUPPORTED, {
    effectiveCadenceMs: 6000,
    coverage: 0.9,
  }),
  cap('powertrainTransmissionTravelledDistance', DrivingCapabilityStatus.SUPPORTED),
  cap('behavior.harshAcceleration', DrivingCapabilityStatus.UNSUPPORTED),
  cap('dimo-trip-segments', DrivingCapabilityStatus.LIMITED, { detectorName: 'dimo-trip-segments', signalName: null }),
];

/** Hypothetical SMART5 HF-rich + chassis signals. */
const SMART5_CHASSIS_CAPABILITIES: ResolvedVehicleDrivingCapability[] = [
  ...LTE_R1_ICE_CAPABILITIES.filter((c) => c.capabilityKey !== 'powertrainTransmissionCurrentGear'),
  cap('powertrainTransmissionCurrentGear', DrivingCapabilityStatus.SUPPORTED),
  cap('powertrainTransmissionSelectedGear', DrivingCapabilityStatus.SUPPORTED),
  cap('powertrainTransmissionTemperature', DrivingCapabilityStatus.SUPPORTED),
  cap('powertrainTransmissionIsClutchSwitchOperated', DrivingCapabilityStatus.SUPPORTED),
  cap('chassisBrakeIsPedalPressed', DrivingCapabilityStatus.SUPPORTED),
  cap('chassisBrakePedalPosition', DrivingCapabilityStatus.SUPPORTED),
  cap('chassisAxleRow1WheelLeftSpeed', DrivingCapabilityStatus.SUPPORTED),
  cap('chassisAxleRow1WheelRightSpeed', DrivingCapabilityStatus.SUPPORTED),
  cap('angularVelocityYaw', DrivingCapabilityStatus.SUPPORTED, {
    effectiveCadenceMs: 3000,
    p95CadenceMs: 8000,
  }),
  cap('behavior.harshCornering', DrivingCapabilityStatus.SUPPORTED, {
    nativeEventAvailable: true,
  }),
];

describe('resolveDrivingDetectorCapabilities', () => {
  it('exports driving-detector-cap-v1 resolver version', () => {
    expect(DRIVING_DETECTOR_CAPABILITY_VERSION).toBe('driving-detector-cap-v1');
  });

  describe('LTE_R1 ICE fleet profile', () => {
    const result = resolveDrivingDetectorCapabilities({
      hardwareType: HardwareType.LTE_R1,
      fuelType: 'PETROL',
      capabilities: LTE_R1_ICE_CAPABILITIES,
    });

    it('promotes native harsh events to PRODUCTION only when events observed', () => {
      const native = getDetectorCapability(result, 'native_harsh_events');
      expect(native?.status).toBe('PRODUCTION');
      expect(native?.reasons).toContain('NATIVE_EVENTS_AVAILABLE');
      expect(native?.requiredNativeEvents.length).toBeGreaterThan(0);
    });

    it('keeps chassis-dependent detectors UNSUPPORTED', () => {
      expect(getDetectorCapability(result, 'gear_stress')?.status).toBe('UNSUPPORTED');
      expect(getDetectorCapability(result, 'wheel_slip')?.status).toBe('UNSUPPORTED');
      expect(getDetectorCapability(result, 'yaw_cornering')?.status).toBe('UNSUPPORTED');
      expect(getDetectorCapability(result, 'brake_intensity')?.status).toBe('UNSUPPORTED');
    });

    it('caps HF engine detectors at SHADOW — never auto PRODUCTION', () => {
      const cold = getDetectorCapability(result, 'cold_engine_load');
      expect(cold?.status).toBe('SHADOW');
      expect(cold?.status).not.toBe('PRODUCTION');
      expect(cold?.requiredSignals).toEqual(
        expect.arrayContaining(['obdEngineLoad', 'powertrainCombustionEngineECT']),
      );
    });

    it('marks idling segment as CONTEXT_ONLY when segments listed', () => {
      expect(getDetectorCapability(result, 'idling_segment')?.status).toBe('CONTEXT_ONLY');
    });
  });

  describe('LTE_R1 EV (Tesla) fleet profile', () => {
    const result = resolveDrivingDetectorCapabilities({
      hardwareType: HardwareType.LTE_R1,
      fuelType: 'ELECTRIC',
      capabilities: LTE_R1_EV_CAPABILITIES,
    });

    it('marks ICE detectors UNSUPPORTED on EV', () => {
      expect(getDetectorCapability(result, 'cold_engine_load')?.status).toBe('UNSUPPORTED');
      expect(getDetectorCapability(result, 'native_harsh_events')?.status).toBe('UNSUPPORTED');
    });

    it('allows EV power demand as SHADOW only', () => {
      const ev = getDetectorCapability(result, 'ev_power_demand');
      expect(ev?.status).toBe('SHADOW');
      expect(ev?.requiredSignals).toEqual(['powertrainTractionBatteryCurrentPower']);
    });
  });

  describe('SMART5 / future chassis-rich profile', () => {
    const result = resolveDrivingDetectorCapabilities({
      hardwareType: HardwareType.SMART5,
      fuelType: 'DIESEL',
      capabilities: SMART5_CHASSIS_CAPABILITIES,
    });

    it('enables gear stress and yaw as SHADOW/PROVIDER_DEPENDENT — not PRODUCTION', () => {
      expect(getDetectorCapability(result, 'gear_stress')?.status).toBe('SHADOW');
      const yaw = getDetectorCapability(result, 'yaw_cornering');
      expect(yaw?.status).toBe('PRODUCTION');
      expect(yaw?.reasons).toContain('NATIVE_EVENTS_AVAILABLE');
    });

    it('keeps wheel slip UNSUPPORTED until all four wheel speeds are probed', () => {
      expect(getDetectorCapability(result, 'wheel_slip')?.status).toBe('UNSUPPORTED');
      expect(getDetectorCapability(result, 'wheel_slip')?.missingRequirements.length).toBeGreaterThan(0);
    });
  });

  describe('degraded / cadence downgrade', () => {
    it('downgrades to TEMPORARILY_DEGRADED when cadence exceeds thresholds', () => {
      const degradedCaps = LTE_R1_ICE_CAPABILITIES.map((row) =>
        row.capabilityKey === 'obdEngineLoad'
          ? {
              ...row,
              capabilityStatus: DrivingCapabilityStatus.DEGRADED,
              effectiveCadenceMs: 25_000,
              p95CadenceMs: 35_000,
            }
          : row,
      );
      const result = resolveDrivingDetectorCapabilities({
        hardwareType: HardwareType.LTE_R1,
        fuelType: 'PETROL',
        capabilities: degradedCaps,
      });
      const cold = getDetectorCapability(result, 'cold_engine_load');
      expect(cold?.status).toBe('TEMPORARILY_DEGRADED');
      expect(cold?.reasons).toContain('CAPABILITY_DEGRADED');
    });
  });

  describe('assessability bridge', () => {
    it('builds trip assessability snapshot from detector resolver output', () => {
      const detectorResult = resolveDrivingDetectorCapabilities({
        hardwareType: HardwareType.LTE_R1,
        fuelType: 'PETROL',
        capabilities: LTE_R1_ICE_CAPABILITIES,
      });
      const snapshot = buildTripAssessabilityCapabilitySnapshot(detectorResult);
      expect(snapshot.nativeBehaviorSupported).toBe(true);
      expect(snapshot.capabilityVersion).toBe(DIMO_CAPABILITY_PREFLIGHT_VERSION);
    });
  });
});
