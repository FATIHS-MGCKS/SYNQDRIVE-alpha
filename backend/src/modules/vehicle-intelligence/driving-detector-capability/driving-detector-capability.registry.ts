/**
 * Driving detector registry — requirements and automatic status ceilings (P32).
 *
 * No detector is auto-promoted to PRODUCTION except `native_harsh_events`
 * when native events are empirically observed via capability probes.
 */
import type {
  DrivingDetectorKey,
  DrivingDetectorSupportStatus,
} from './driving-detector-capability.types';
import type {
  DrivingDetectorDefinition,
  DrivingDetectorRequirement,
} from './driving-detector-capability.registry.types';

export type {
  DrivingDetectorDefinition,
  DrivingDetectorRequirement,
} from './driving-detector-capability.registry.types';

export const NATIVE_BEHAVIOR_EVENT_NAMES = [
  'behavior.harshAcceleration',
  'behavior.harshBraking',
  'behavior.harshCornering',
] as const;

export const DIMO_TRIP_SEGMENTS_DETECTOR = 'dimo-trip-segments';

/** HF cadence thresholds from fleet audit (effective median 3–10 s, P95 up to 40 s). */
export const DETECTOR_CADENCE_SHADOW_MAX_MS = 10_000;
export const DETECTOR_CADENCE_DEGRADED_MAX_MS = 20_000;
export const DETECTOR_MIN_COVERAGE_SHADOW = 0.5;

function req(
  kind: DrivingDetectorRequirement['kind'],
  name: string,
): DrivingDetectorRequirement {
  return { kind, name };
}

export const DRIVING_DETECTOR_REGISTRY: readonly DrivingDetectorDefinition[] = [
  {
    key: 'native_harsh_events',
    label: 'Native Harsh Events',
    requirements: NATIVE_BEHAVIOR_EVENT_NAMES.map((name) => req('native_event', name)),
    maxAutomaticStatus: 'PROVIDER_DEPENDENT',
    productionRequiresNativeEvents: true,
    requireAnyNativeEvent: true,
  },
  {
    key: 'cold_engine_load',
    label: 'Cold Engine Load',
    requirements: [
      req('signal', 'obdEngineLoad'),
      req('signal', 'powertrainCombustionEngineECT'),
      req('signal', 'powertrainCombustionEngineSpeed'),
      req('signal', 'obdRunTime'),
    ],
    iceOnly: true,
    maxAutomaticStatus: 'SHADOW',
    maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
    minCoverage: DETECTOR_MIN_COVERAGE_SHADOW,
  },
  {
    key: 'start_kickdown_proxy',
    label: 'Start/Kickdown Proxy',
    requirements: [
      req('signal', 'obdThrottlePosition'),
      req('signal', 'obdEngineLoad'),
      req('signal', 'powertrainCombustionEngineSpeed'),
      req('signal', 'speed'),
    ],
    iceOnly: true,
    maxAutomaticStatus: 'SHADOW',
    maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  },
  {
    key: 'rev_in_idle',
    label: 'Rev in Idle',
    requirements: [
      req('signal', 'powertrainCombustionEngineSpeed'),
      req('signal', 'speed'),
    ],
    iceOnly: true,
    maxAutomaticStatus: 'SHADOW',
    maxEffectiveCadenceMs: DETECTOR_CADENCE_DEGRADED_MAX_MS,
  },
  {
    key: 'sustained_high_load',
    label: 'Sustained High Load',
    requirements: [req('signal', 'obdEngineLoad')],
    iceOnly: true,
    maxAutomaticStatus: 'SHADOW',
    maxEffectiveCadenceMs: DETECTOR_CADENCE_SHADOW_MAX_MS,
  },
  {
    key: 'gear_stress',
    label: 'Gear Stress',
    requirements: [
      req('signal', 'powertrainTransmissionCurrentGear'),
      req('signal', 'powertrainCombustionEngineSpeed'),
    ],
    iceOnly: true,
    maxAutomaticStatus: 'SHADOW',
  },
  {
    key: 'brake_intensity',
    label: 'Brake Intensity',
    requirements: [
      req('native_event', 'behavior.harshBraking'),
      req('signal', 'chassisBrakeIsPedalPressed'),
      req('signal', 'chassisBrakePedalPosition'),
    ],
    requireAnySignal: ['chassisBrakeIsPedalPressed', 'chassisBrakePedalPosition'],
    requireAnyNativeEvent: true,
    maxAutomaticStatus: 'PROVIDER_DEPENDENT',
    productionRequiresNativeEvents: true,
  },
  {
    key: 'wheel_slip',
    label: 'Wheel Slip',
    requirements: [
      req('signal', 'chassisAxleRow1WheelLeftSpeed'),
      req('signal', 'chassisAxleRow1WheelRightSpeed'),
      req('signal', 'chassisAxleRow2WheelLeftSpeed'),
      req('signal', 'chassisAxleRow2WheelRightSpeed'),
    ],
    maxAutomaticStatus: 'SHADOW',
  },
  {
    key: 'yaw_cornering',
    label: 'Yaw Cornering',
    requirements: [
      req('native_event', 'behavior.harshCornering'),
      req('signal', 'angularVelocityYaw'),
    ],
    requireAnyNativeEvent: true,
    requireAnySignal: ['angularVelocityYaw'],
    maxAutomaticStatus: 'PROVIDER_DEPENDENT',
    productionRequiresNativeEvents: true,
  },
  {
    key: 'ev_power_demand',
    label: 'EV Power Demand',
    requirements: [req('signal', 'powertrainTractionBatteryCurrentPower')],
    evOnly: true,
    maxAutomaticStatus: 'SHADOW',
  },
  {
    key: 'idling_segment',
    label: 'Idling Segment',
    requirements: [
      req('segment_detector', DIMO_TRIP_SEGMENTS_DETECTOR),
      req('signal', 'speed'),
    ],
    maxAutomaticStatus: 'CONTEXT_ONLY',
  },
] as const;

export function listDrivingDetectorKeys(): DrivingDetectorKey[] {
  return DRIVING_DETECTOR_REGISTRY.map((d) => d.key);
}

export function getDrivingDetectorDefinition(
  key: DrivingDetectorKey,
): DrivingDetectorDefinition | undefined {
  return DRIVING_DETECTOR_REGISTRY.find((d) => d.key === key);
}

export function isLowerStatus(
  a: DrivingDetectorSupportStatus,
  b: DrivingDetectorSupportStatus,
): boolean {
  const order: DrivingDetectorSupportStatus[] = [
    'PRODUCTION',
    'PROVIDER_DEPENDENT',
    'SHADOW',
    'CONTEXT_ONLY',
    'TEMPORARILY_DEGRADED',
    'UNSUPPORTED',
  ];
  return order.indexOf(a) > order.indexOf(b);
}

export function minStatus(
  a: DrivingDetectorSupportStatus,
  b: DrivingDetectorSupportStatus,
): DrivingDetectorSupportStatus {
  return isLowerStatus(a, b) ? a : b;
}
