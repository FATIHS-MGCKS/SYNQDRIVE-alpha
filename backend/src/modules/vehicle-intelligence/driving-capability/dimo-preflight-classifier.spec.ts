import { DrivingCapabilityStatus } from '@prisma/client';
import {
  buildPreflightProbes,
  classifyNativeEventProbes,
  classifySegmentsProbe,
  classifySignalProbe,
} from './dimo-preflight-classifier';
import {
  catalogForHardware,
  DIMO_CAPABILITY_PREFLIGHT_VERSION,
  PREFLIGHT_NATIVE_EVENT_KEYS,
  PREFLIGHT_SEGMENT_DETECTOR,
  PREFLIGHT_SIGNAL_CATALOG,
} from './dimo-preflight-classifier.config';

/** Audit ICE LTE_R1 fleet baseline (docs/audits/dimo-driving-signals-capability.md §5.1). */
const LTE_R1_ICE_AVAILABLE_SIGNALS = [
  'speed',
  'isIgnitionOn',
  'currentLocationAltitude',
  'currentLocationHeading',
  'powertrainTransmissionTravelledDistance',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineECT',
  'obdEngineLoad',
  'obdRunTime',
  'obdThrottlePosition',
  'exteriorAirTemperature',
];

/** Audit Tesla Model 3 EV subset (§5.3). */
const LTE_R1_EV_AVAILABLE_SIGNALS = [
  'speed',
  'powertrainTransmissionTravelledDistance',
  'exteriorAirTemperature',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'powertrainTractionBatteryStateOfChargeCurrentEnergy',
];

/** Hypothetical SMART5 HF-rich profile — not empirically validated in prod audit. */
const SMART5_HF_AVAILABLE_SIGNALS = [
  'speed',
  'isIgnitionOn',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'obdEngineLoad',
  'powertrainCombustionEngineECT',
  'powertrainCombustionEngineTorque',
  'powertrainTransmissionCurrentGear',
  'chassisBrakeIsPedalPressed',
  'chassisAxleRow1WheelLeftSpeed',
  'angularVelocityYaw',
  'currentLocationAltitude',
  'currentLocationHeading',
  'powertrainTransmissionTravelledDistance',
];

const checkedAt = new Date('2026-07-16T17:52:46.000Z');

function iceDataSummary(events: { name: string; count: number }[] = []) {
  return {
    numberOfSignals: 268708,
    firstSignalSeen: '2026-01-01T00:00:00.000Z',
    lastSignalSeen: '2026-07-16T17:00:00.000Z',
    eventDataSummary: events.map((e) => ({
      name: e.name,
      numberOfEvents: e.count,
      firstSeen: '2026-06-01T00:00:00.000Z',
      lastSeen: '2026-07-16T16:00:00.000Z',
    })),
  };
}

describe('dimo-preflight-classifier', () => {
  it('exports cap-preflight-v1 capability version constant', () => {
    expect(DIMO_CAPABILITY_PREFLIGHT_VERSION).toBe('cap-preflight-v1');
    expect(PREFLIGHT_SIGNAL_CATALOG.length).toBeGreaterThanOrEqual(16);
    expect(PREFLIGHT_NATIVE_EVENT_KEYS).toHaveLength(4);
  });

  describe('LTE_R1 ICE hardware profile', () => {
    const catalog = catalogForHardware('LTE_R1');
    const available = new Set(LTE_R1_ICE_AVAILABLE_SIGNALS);
    const dataSummary = iceDataSummary([
      { name: 'behavior.harshAcceleration', count: 42 },
      { name: 'behavior.harshCornering', count: 3 },
    ]);

    it('marks listed ICE signals SUPPORTED and missing audit signals UNSUPPORTED', () => {
      const probes = buildPreflightProbes({
        availableSignals: LTE_R1_ICE_AVAILABLE_SIGNALS,
        dataSummary,
        catalog,
        fuelType: 'PETROL',
        checkedAt,
      });

      const rpm = probes.find((p) => p.capabilityKey === 'powertrainCombustionEngineSpeed');
      expect(rpm?.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
      expect(rpm?.metadata.source).toBe('DIMO_AVAILABLE_SIGNALS');

      const yaw = probes.find((p) => p.capabilityKey === 'angularVelocityYaw');
      expect(yaw?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);

      const brakePedal = probes.find((p) => p.capabilityKey === 'chassisBrakeIsPedalPressed');
      expect(brakePedal?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);

      const torque = probes.find((p) => p.capabilityKey === 'powertrainCombustionEngineTorque');
      expect(torque?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
    });

    it('classifies native events from dataSummary only — not from documentation', () => {
      const events = classifyNativeEventProbes(dataSummary, checkedAt);
      const accel = events.find((e) => e.capabilityKey === 'behavior.harshAcceleration');
      const braking = events.find((e) => e.capabilityKey === 'behavior.harshBraking');
      const collision = events.find((e) => e.capabilityKey === 'safety.collision');

      expect(accel?.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
      expect(accel?.nativeEventAvailable).toBe(true);
      expect(braking?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
      expect(collision?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
    });

    it('marks segments SUPPORTED when speed + odometer are listed', () => {
      const segment = classifySegmentsProbe(available, dataSummary, checkedAt);
      expect(segment.detectorName).toBe(PREFLIGHT_SEGMENT_DETECTOR);
      expect(segment.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
    });

    it('marks EV-only battery power UNSUPPORTED on ICE', () => {
      const evPower = classifySignalProbe(
        catalog.find((d) => d.key === 'evBatteryPower')!,
        available,
        'PETROL',
        dataSummary,
        checkedAt,
      );
      expect(evPower.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
      expect(evPower.metadata.reason).toBe('powertrain_not_applicable');
    });
  });

  describe('LTE_R1 EV (Tesla) hardware profile', () => {
    const catalog = catalogForHardware('LTE_R1');
    const dataSummary = {
      numberOfSignals: 6658060,
      lastSignalSeen: '2026-07-16T12:00:00.000Z',
      eventDataSummary: [],
    };

    it('marks ICE engine signals powertrain_not_applicable and EV power SUPPORTED', () => {
      const probes = buildPreflightProbes({
        availableSignals: LTE_R1_EV_AVAILABLE_SIGNALS,
        dataSummary,
        catalog,
        fuelType: 'ELECTRIC',
        checkedAt,
      });

      const rpm = probes.find((p) => p.capabilityKey === 'powertrainCombustionEngineSpeed');
      expect(rpm?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
      expect(rpm?.metadata.reason).toBe('powertrain_not_applicable');

      const evPower = probes.find(
        (p) => p.capabilityKey === 'powertrainTractionBatteryCurrentPower',
      );
      expect(evPower?.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);

      const altitude = probes.find((p) => p.capabilityKey === 'currentLocationAltitude');
      expect(altitude?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
    });

    it('marks all native behavior events UNSUPPORTED when dataSummary has zero events', () => {
      const events = classifyNativeEventProbes(dataSummary, checkedAt);
      for (const row of events) {
        expect(row.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
        expect(row.nativeEventAvailable).toBe(false);
      }
    });
  });

  describe('SMART5 hardware profile (hypothetical HF-rich)', () => {
    const catalog = catalogForHardware('SMART5');
    const dataSummary = iceDataSummary([
      { name: 'behavior.harshAcceleration', count: 5 },
      { name: 'behavior.harshBraking', count: 2 },
      { name: 'behavior.harshCornering', count: 1 },
    ]);

    it('marks extended HF signals SUPPORTED when listed — still no doc-only activation', () => {
      const probes = buildPreflightProbes({
        availableSignals: SMART5_HF_AVAILABLE_SIGNALS,
        dataSummary,
        catalog,
        fuelType: 'DIESEL',
        checkedAt,
      });

      const yaw = probes.find((p) => p.capabilityKey === 'angularVelocityYaw');
      expect(yaw?.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);

      const gear = probes.find((p) => p.capabilityKey === 'powertrainTransmissionCurrentGear');
      expect(gear?.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);

      const torque = probes.find((p) => p.capabilityKey === 'powertrainCombustionEngineTorque');
      expect(torque?.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);

      const oilTemp = probes.find((p) => p.capabilityKey === 'powertrainCombustionEngineEOT');
      expect(oilTemp?.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
    });
  });

  describe('segments edge cases', () => {
    it('is LIMITED when only speed is listed', () => {
      const segment = classifySegmentsProbe(new Set(['speed']), null, checkedAt);
      expect(segment.capabilityStatus).toBe(DrivingCapabilityStatus.LIMITED);
      expect(segment.metadata.reason).toBe('segments_limited_missing_odometer');
    });

    it('is UNSUPPORTED when speed is missing', () => {
      const segment = classifySegmentsProbe(new Set(['powertrainTransmissionTravelledDistance']), null, checkedAt);
      expect(segment.capabilityStatus).toBe(DrivingCapabilityStatus.UNSUPPORTED);
    });
  });
});
