/**
 * Capability-, provider-, powertrain-, and freshness-aware fleet data coverage.
 *
 * Coverage = fresh usable expected signals / expected and supported signals.
 * Non-applicable capabilities are excluded from the denominator.
 */
import type { TelemetryFreshness } from './vehicle-state-interpreter';
import {
  FleetDataCoverageReasonCode,
  FleetDataCoverageState,
  FLEET_SIGNAL_KEYS,
  SignalCapabilityExpectation,
  SignalRuntimeStatus,
  type FleetCoverageContext,
  type FleetDataCoverageResult,
  type FleetDeviceClass,
  type FleetPowertrainClass,
  type FleetProviderClass,
  type FleetSignalCoverageDetail,
  type FleetSignalKey,
  type FleetSignalObservationInput,
} from './fleet-data-coverage.types';

export * from './fleet-data-coverage.types';

const COVERAGE_GOOD_MIN = 80;
const COVERAGE_PARTIAL_MIN = 50;

function hasRawSignal(
  signals: Record<string, unknown> | null,
  key: string,
): boolean {
  if (!signals) return false;
  const field = signals[key];
  if (field == null) return false;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value?: unknown }).value != null;
  }
  return true;
}

function isDtcPolled(input: FleetSignalObservationInput): boolean {
  if (input.lastDtcPollAt != null) return true;
  if (Array.isArray(input.obdDtcList)) return true;
  if (input.obdDtcList != null && typeof input.obdDtcList === 'object') {
    return Object.keys(input.obdDtcList as object).length >= 0;
  }
  return (
    hasRawSignal(input.rawSignals, 'obdDTCList') ||
    hasRawSignal(input.rawSignals, 'obdDtcList')
  );
}

function isSignalValuePresent(
  key: FleetSignalKey,
  input: FleetSignalObservationInput,
): boolean {
  const raw = input.rawSignals;
  switch (key) {
    case 'gps':
      return (
        (input.latitude != null && input.longitude != null) ||
        hasRawSignal(raw, 'currentLocationCoordinates')
      );
    case 'odometer':
      return (
        input.odometerKm != null ||
        hasRawSignal(raw, 'powertrainTransmissionTravelledDistance')
      );
    case 'speed':
      return input.speedKmh != null || hasRawSignal(raw, 'speed');
    case 'fuel':
      return (
        input.fuelLevelRelative != null ||
        input.fuelLevelAbsolute != null ||
        hasRawSignal(raw, 'powertrainFuelSystemRelativeLevel') ||
        hasRawSignal(raw, 'powertrainFuelSystemAbsoluteLevel')
      );
    case 'evSoc':
      return (
        input.evSoc != null ||
        hasRawSignal(raw, 'powertrainTractionBatteryStateOfChargeCurrent')
      );
    case 'dtc':
      return isDtcPolled(input);
    case 'obdPlug':
      return input.obdIsPluggedIn != null || hasRawSignal(raw, 'obdIsPluggedIn');
    case 'jamming':
      return (
        input.jammingDetectedCount > 0 ||
        hasRawSignal(raw, 'connectivityCellularIsJammingDetected')
      );
    default:
      return false;
  }
}

export function resolveFleetPowertrainClass(
  fuelType: string | null | undefined,
): FleetPowertrainClass {
  const normalized = (fuelType ?? '').trim().toUpperCase();
  if (normalized === 'ELECTRIC' || normalized === 'EV' || normalized === 'BEV') {
    return 'EV';
  }
  if (
    normalized === 'PLUGIN_HYBRID' ||
    normalized === 'PHEV' ||
    normalized === 'HYBRID'
  ) {
    return 'PHEV';
  }
  if (
    normalized === 'GASOLINE' ||
    normalized === 'DIESEL' ||
    normalized === 'PETROL' ||
    normalized === 'ICE' ||
    normalized === 'GAS' ||
    normalized === 'LPG' ||
    normalized === 'CNG'
  ) {
    return 'ICE';
  }
  return 'UNKNOWN';
}

export function resolveFleetDeviceClass(input: {
  hardwareType?: string | null;
  hasAftermarketDevice: boolean;
  hasSyntheticDevice: boolean;
  hasProviderLink: boolean;
}): FleetDeviceClass {
  if (!input.hasProviderLink) return 'NONE';
  if (
    input.hardwareType === 'LTE_R1' ||
    input.hasAftermarketDevice
  ) {
    return 'PHYSICAL_OBD';
  }
  if (input.hasSyntheticDevice) return 'SYNTHETIC';
  return 'OEM';
}

export function resolveFleetProviderClass(
  hasProviderLink: boolean,
  providerSource?: string | null,
): FleetProviderClass {
  if (!hasProviderLink) return 'NONE';
  const source = (providerSource ?? 'DIMO').trim().toUpperCase();
  if (source.includes('HIGH_MOBILITY') || source === 'HM') return 'HIGH_MOBILITY';
  if (source === 'MANUAL') return 'MANUAL';
  return 'DIMO';
}

/**
 * Capability matrix: which signals are expected per vehicle context.
 */
export function resolveSignalCapabilityMatrix(
  ctx: FleetCoverageContext,
): Record<FleetSignalKey, SignalCapabilityExpectation> {
  const base: Record<FleetSignalKey, SignalCapabilityExpectation> = {
    gps: SignalCapabilityExpectation.UNSUPPORTED,
    odometer: SignalCapabilityExpectation.UNSUPPORTED,
    speed: SignalCapabilityExpectation.UNSUPPORTED,
    fuel: SignalCapabilityExpectation.NOT_APPLICABLE,
    evSoc: SignalCapabilityExpectation.NOT_APPLICABLE,
    dtc: SignalCapabilityExpectation.UNSUPPORTED,
    obdPlug: SignalCapabilityExpectation.NOT_APPLICABLE,
    jamming: SignalCapabilityExpectation.NOT_APPLICABLE,
  };

  if (!ctx.hasProviderLink) {
    return base;
  }

  if (ctx.provider === 'NONE') {
    return base;
  }

  base.gps = SignalCapabilityExpectation.EXPECTED;
  base.odometer = SignalCapabilityExpectation.EXPECTED;
  base.speed = SignalCapabilityExpectation.EXPECTED;
  base.dtc =
    ctx.deviceClass === 'PHYSICAL_OBD' || ctx.deviceClass === 'OEM'
      ? SignalCapabilityExpectation.EXPECTED
      : SignalCapabilityExpectation.OPTIONAL;

  switch (ctx.powertrain) {
    case 'ICE':
      base.fuel = SignalCapabilityExpectation.EXPECTED;
      base.evSoc = SignalCapabilityExpectation.NOT_APPLICABLE;
      break;
    case 'EV':
      base.fuel = SignalCapabilityExpectation.NOT_APPLICABLE;
      base.evSoc = SignalCapabilityExpectation.EXPECTED;
      break;
    case 'PHEV':
      base.fuel = SignalCapabilityExpectation.EXPECTED;
      base.evSoc = SignalCapabilityExpectation.EXPECTED;
      break;
    default:
      base.fuel = SignalCapabilityExpectation.OPTIONAL;
      base.evSoc = SignalCapabilityExpectation.OPTIONAL;
      break;
  }

  if (ctx.deviceClass === 'PHYSICAL_OBD' && ctx.physicalObdCapable) {
    base.obdPlug = SignalCapabilityExpectation.EXPECTED;
    base.jamming = SignalCapabilityExpectation.OPTIONAL;
  } else if (ctx.deviceClass === 'OEM') {
    base.obdPlug = SignalCapabilityExpectation.NOT_APPLICABLE;
    base.jamming = SignalCapabilityExpectation.NOT_APPLICABLE;
  } else if (ctx.deviceClass === 'SYNTHETIC') {
    base.obdPlug = SignalCapabilityExpectation.NOT_APPLICABLE;
    base.jamming = SignalCapabilityExpectation.NOT_APPLICABLE;
    base.dtc = SignalCapabilityExpectation.OPTIONAL;
  }

  return base;
}

function resolveRuntimeStatus(
  capability: SignalCapabilityExpectation,
  valuePresent: boolean,
  hasTelemetrySnapshot: boolean,
  telemetryFreshness: TelemetryFreshness,
): SignalRuntimeStatus {
  if (capability === SignalCapabilityExpectation.NOT_APPLICABLE) {
    return SignalRuntimeStatus.NOT_APPLICABLE;
  }
  if (capability === SignalCapabilityExpectation.UNSUPPORTED) {
    return SignalRuntimeStatus.UNSUPPORTED;
  }
  if (capability === SignalCapabilityExpectation.OPTIONAL) {
    if (!hasTelemetrySnapshot) return SignalRuntimeStatus.OPTIONAL;
    if (!valuePresent) return SignalRuntimeStatus.OPTIONAL;
    if (
      telemetryFreshness === 'live' ||
      telemetryFreshness === 'standby'
    ) {
      return SignalRuntimeStatus.AVAILABLE_FRESH;
    }
    if (
      telemetryFreshness === 'signal_delayed' ||
      telemetryFreshness === 'offline'
    ) {
      return SignalRuntimeStatus.AVAILABLE_STALE;
    }
    return SignalRuntimeStatus.UNKNOWN;
  }

  if (!hasTelemetrySnapshot) {
    return SignalRuntimeStatus.UNKNOWN;
  }

  if (!valuePresent) {
    return SignalRuntimeStatus.MISSING;
  }

  if (telemetryFreshness === 'live' || telemetryFreshness === 'standby') {
    return SignalRuntimeStatus.AVAILABLE_FRESH;
  }
  if (telemetryFreshness === 'signal_delayed' || telemetryFreshness === 'offline') {
    return SignalRuntimeStatus.AVAILABLE_STALE;
  }
  if (telemetryFreshness === 'no_signal') {
    return SignalRuntimeStatus.UNKNOWN;
  }

  return SignalRuntimeStatus.UNKNOWN;
}

export function buildFleetDataCoverage(input: {
  context: FleetCoverageContext;
  observation: FleetSignalObservationInput;
  telemetryFreshness: TelemetryFreshness;
}): FleetDataCoverageResult {
  const reasonCodes: FleetDataCoverageReasonCode[] = [];
  const capabilityMatrix = resolveSignalCapabilityMatrix(input.context);

  if (!input.context.hasProviderLink) {
    return emptyCoverage(FleetDataCoverageState.NOT_APPLICABLE, [
      FleetDataCoverageReasonCode.SIGNAL_NOT_APPLICABLE,
    ]);
  }

  if (!input.context.hasTelemetrySnapshot) {
    reasonCodes.push(FleetDataCoverageReasonCode.NO_TELEMETRY_SNAPSHOT);
  }

  if (input.context.powertrain === 'UNKNOWN') {
    reasonCodes.push(FleetDataCoverageReasonCode.CAPABILITY_UNKNOWN);
  }

  if (
    input.telemetryFreshness === 'signal_delayed' ||
    input.telemetryFreshness === 'offline'
  ) {
    reasonCodes.push(FleetDataCoverageReasonCode.TELEMETRY_STALE);
  }

  const signals: FleetSignalCoverageDetail[] = FLEET_SIGNAL_KEYS.map((key) => {
    const capability = capabilityMatrix[key];
    const valuePresent = isSignalValuePresent(key, input.observation);
    const status = resolveRuntimeStatus(
      capability,
      valuePresent,
      input.context.hasTelemetrySnapshot,
      input.telemetryFreshness,
    );
    return { key, capability, status };
  });

  const expectedSignals = signals.filter(
    (s) => s.capability === SignalCapabilityExpectation.EXPECTED,
  );
  const expectedSignalCount = expectedSignals.length;

  if (expectedSignalCount === 0) {
    return {
      coverageState: FleetDataCoverageState.NOT_APPLICABLE,
      coveragePercent: null,
      expectedSignalCount: 0,
      freshSignalCount: 0,
      staleSignalCount: 0,
      missingSignalCount: 0,
      reasonCodes: [...new Set(reasonCodes)],
      signals,
    };
  }

  const freshSignalCount = expectedSignals.filter(
    (s) => s.status === SignalRuntimeStatus.AVAILABLE_FRESH,
  ).length;
  const staleSignalCount = expectedSignals.filter(
    (s) => s.status === SignalRuntimeStatus.AVAILABLE_STALE ||
      s.status === SignalRuntimeStatus.HISTORICALLY_AVAILABLE,
  ).length;
  const missingSignalCount = expectedSignals.filter(
    (s) => s.status === SignalRuntimeStatus.MISSING,
  ).length;

  if (!input.context.hasTelemetrySnapshot) {
    return {
      coverageState: FleetDataCoverageState.UNKNOWN,
      coveragePercent: null,
      expectedSignalCount,
      freshSignalCount: 0,
      staleSignalCount: 0,
      missingSignalCount,
      reasonCodes: [...new Set(reasonCodes)],
      signals,
    };
  }

  const coveragePercent = Math.round(
    (freshSignalCount / expectedSignalCount) * 100,
  );

  let coverageState: FleetDataCoverageState;
  if (coveragePercent >= COVERAGE_GOOD_MIN) {
    coverageState = FleetDataCoverageState.GOOD;
  } else if (coveragePercent >= COVERAGE_PARTIAL_MIN) {
    coverageState = FleetDataCoverageState.PARTIAL;
    reasonCodes.push(FleetDataCoverageReasonCode.DATA_COVERAGE_PARTIAL);
  } else {
    coverageState = FleetDataCoverageState.INSUFFICIENT;
    reasonCodes.push(FleetDataCoverageReasonCode.DATA_COVERAGE_INSUFFICIENT);
  }

  return {
    coverageState,
    coveragePercent,
    expectedSignalCount,
    freshSignalCount,
    staleSignalCount,
    missingSignalCount,
    reasonCodes: [...new Set(reasonCodes)],
    signals,
  };
}

function emptyCoverage(
  state: FleetDataCoverageState,
  reasonCodes: FleetDataCoverageReasonCode[],
): FleetDataCoverageResult {
  return {
    coverageState: state,
    coveragePercent: null,
    expectedSignalCount: 0,
    freshSignalCount: 0,
    staleSignalCount: 0,
    missingSignalCount: 0,
    reasonCodes,
    signals: FLEET_SIGNAL_KEYS.map((key) => ({
      key,
      capability: SignalCapabilityExpectation.UNSUPPORTED,
      status: SignalRuntimeStatus.UNSUPPORTED,
    })),
  };
}

/** Map coverage state to legacy readiness level for transitional API fields. */
export function mapCoverageStateToLegacyReadinessLevel(
  state: FleetDataCoverageState,
): 'good' | 'watch' | 'warning' | 'no_data' {
  switch (state) {
    case FleetDataCoverageState.GOOD:
      return 'good';
    case FleetDataCoverageState.PARTIAL:
      return 'watch';
    case FleetDataCoverageState.INSUFFICIENT:
      return 'warning';
    default:
      return 'no_data';
  }
}
