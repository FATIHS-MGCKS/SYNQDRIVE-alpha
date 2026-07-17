import type { HvBatterySignalObservedAt } from '../../../dimo/mappers/dimo-battery-signal.mapper';
import {
  BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS,
  buildBatterySignalFreshness,
  buildNamedFreshnessSlices,
  buildSignalEnvelope,
  observationFreshnessToSignalFreshness,
  type BatteryNamedFreshnessSlices,
  type BatterySignalEnvelope,
  type BatterySignalError,
  type BatterySignalFreshness,
  type BatterySignalSource,
} from '../battery-signal-freshness.contract';
import type { ObservationFreshness } from '../battery-freshness.policy';
import type {
  CanonicalBatteryHvLiveValues,
  CanonicalBatteryLvLiveValues,
} from './canonical-battery.types';

export interface CanonicalBatterySignalFreshnessInput {
  now: Date;
  receivedAt: Date | string | null | undefined;
  lvValues: CanonicalBatteryLvLiveValues;
  hvValues: CanonicalBatteryHvLiveValues;
  lvVoltageObservedAt: Date | string | null | undefined;
  lvSnapshotObservedAt: Date | string | null | undefined;
  hvSignalObservedAt?: Partial<Record<keyof HvBatterySignalObservedAt, Date | null>>;
  hvAggregateObservedAt: Date | string | null | undefined;
  providerSohObservedAt: Date | string | null | undefined;
  restMeasurementObservedAt: Date | string | null | undefined;
  startProxyObservedAt: Date | string | null | undefined;
  assessmentObservedAt: Date | string | null | undefined;
  publicationObservedAt: Date | string | null | undefined;
  hvSessionObservedAt: Date | string | null | undefined;
  lvObservationFreshness: ObservationFreshness;
  lvRestMeasurementFreshness: ObservationFreshness;
  lvStartProxyFreshness: ObservationFreshness;
  lvAssessmentFreshness: ObservationFreshness;
  lvPublicationFreshness: ObservationFreshness;
  providerSohObservationFreshness: ObservationFreshness;
  hvSessionObservationFreshness: ObservationFreshness | null;
  isEv: boolean;
}

export interface CanonicalBatteryLiveSignalFreshness {
  lv: Record<keyof CanonicalBatteryLvLiveValues, BatterySignalFreshness>;
  hv: Record<keyof CanonicalBatteryHvLiveValues, BatterySignalFreshness>;
}

export interface CanonicalBatterySignalFreshnessResult {
  live: CanonicalBatteryLiveSignalFreshness;
  namedSlices: BatteryNamedFreshnessSlices;
  lvSignals: Record<keyof CanonicalBatteryLvLiveValues, BatterySignalEnvelope<CanonicalBatteryLvLiveValues[keyof CanonicalBatteryLvLiveValues]>>;
  hvSignals: Record<keyof CanonicalBatteryHvLiveValues, BatterySignalEnvelope<CanonicalBatteryHvLiveValues[keyof CanonicalBatteryHvLiveValues]>>;
}

const LV_LIVE_VALUE_KEYS = [
  'voltageV',
  'voltageSource',
  'temperatureC',
  'restingVoltageV',
  'crankingVoltageV',
  'chargingVoltageV',
  'engineRunning',
] as const satisfies ReadonlyArray<keyof CanonicalBatteryLvLiveValues>;

const HV_LIVE_VALUE_KEYS = [
  'socPercent',
  'rangeKm',
  'currentEnergyKwh',
  'grossCapacityKwh',
  'addedEnergyKwh',
  'chargingPowerKw',
  'currentVoltageV',
  'temperatureC',
  'isCharging',
  'chargingCableConnected',
  'providerSohPercent',
] as const satisfies ReadonlyArray<keyof CanonicalBatteryHvLiveValues>;

function resolveHvObservedAt(
  signalKey: keyof HvBatterySignalObservedAt,
  input: CanonicalBatterySignalFreshnessInput,
): Date | string | null | undefined {
  return (
    input.hvSignalObservedAt?.[signalKey] ??
    input.hvAggregateObservedAt ??
    null
  );
}

function buildLvSource(
  voltageSource: CanonicalBatteryLvLiveValues['voltageSource'],
): BatterySignalSource {
  if (voltageSource === 'resting_snapshot') return 'RESTING_SNAPSHOT';
  if (voltageSource === 'live_telemetry') return 'LIVE_TELEMETRY';
  return 'UNKNOWN';
}

export function buildCanonicalBatterySignalFreshness(
  input: CanonicalBatterySignalFreshnessInput,
): CanonicalBatterySignalFreshnessResult {
  const lvVoltageFreshness = observationFreshnessToSignalFreshness(
    input.lvObservationFreshness,
    {
      receivedAt: input.receivedAt,
      source: buildLvSource(input.lvValues.voltageSource),
      hasValue: input.lvValues.voltageV != null,
    },
  );

  const namedSlices = buildNamedFreshnessSlices({
    liveVoltageFreshness: lvVoltageFreshness,
    restMeasurementFreshness: observationFreshnessToSignalFreshness(
      input.lvRestMeasurementFreshness,
      {
        receivedAt: input.receivedAt,
        source: 'V2_PUBLICATION',
        hasValue: input.lvValues.restingVoltageV != null,
      },
    ),
    startProxyFreshness: observationFreshnessToSignalFreshness(
      input.lvStartProxyFreshness,
      {
        receivedAt: input.receivedAt,
        source: 'V2_PUBLICATION',
        hasValue: input.lvValues.crankingVoltageV != null,
      },
    ),
    assessmentFreshness: observationFreshnessToSignalFreshness(
      input.lvAssessmentFreshness,
      {
        receivedAt: input.receivedAt,
        source: 'V2_PUBLICATION',
        hasValue: true,
      },
    ),
    publicationFreshness: observationFreshnessToSignalFreshness(
      input.lvPublicationFreshness,
      {
        receivedAt: input.receivedAt,
        source: 'V2_PUBLICATION',
        hasValue: true,
      },
    ),
    providerSohFreshness: observationFreshnessToSignalFreshness(
      input.providerSohObservationFreshness,
      {
        receivedAt: input.receivedAt,
        source: 'BATTERY_EVIDENCE',
        hasValue: input.hvValues.providerSohPercent != null,
      },
    ),
    hvSessionFreshness: input.hvSessionObservationFreshness
      ? observationFreshnessToSignalFreshness(input.hvSessionObservationFreshness, {
          receivedAt: input.receivedAt,
          source: 'HV_CHARGE_SESSION',
          hasValue: true,
        })
      : null,
  });

  const lvSnapshotAt = input.lvSnapshotObservedAt;
  const lv: CanonicalBatteryLiveSignalFreshness['lv'] = {
    voltageV: lvVoltageFreshness,
    voltageSource: lvVoltageFreshness,
    temperatureC: buildBatterySignalFreshness({
      observedAt: lvSnapshotAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      source: 'RESTING_SNAPSHOT',
      hasValue: input.lvValues.temperatureC != null,
    }),
    restingVoltageV: buildBatterySignalFreshness({
      observedAt: input.restMeasurementObservedAt ?? lvSnapshotAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.restMeasurementObservation,
      source: 'RESTING_SNAPSHOT',
      hasValue: input.lvValues.restingVoltageV != null,
    }),
    crankingVoltageV: buildBatterySignalFreshness({
      observedAt: input.startProxyObservedAt ?? lvSnapshotAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.startProxyObservation,
      source: 'V2_PUBLICATION',
      hasValue: input.lvValues.crankingVoltageV != null,
    }),
    chargingVoltageV: buildBatterySignalFreshness({
      observedAt: lvSnapshotAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      source: 'RESTING_SNAPSHOT',
      hasValue: input.lvValues.chargingVoltageV != null,
    }),
    engineRunning: buildBatterySignalFreshness({
      observedAt: lvSnapshotAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.lvLiveObservation,
      source: 'RESTING_SNAPSHOT',
      hasValue: input.lvValues.engineRunning != null,
    }),
  };

  const hvSource: BatterySignalSource = 'DIMO_TELEMETRY';
  const hv: CanonicalBatteryLiveSignalFreshness['hv'] = {
    socPercent: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('soc', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.socPercent != null,
    }),
    rangeKm: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('rangeKm', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.rangeKm != null,
    }),
    currentEnergyKwh: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('currentEnergyKwh', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.currentEnergyKwh != null,
    }),
    grossCapacityKwh: buildBatterySignalFreshness({
      observedAt: input.hvAggregateObservedAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.grossCapacityKwh != null,
    }),
    addedEnergyKwh: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('addedEnergyKwh', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.addedEnergyKwh != null,
    }),
    chargingPowerKw: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('chargingPowerKw', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.chargingPowerKw != null,
    }),
    currentVoltageV: buildBatterySignalFreshness({
      observedAt: input.hvAggregateObservedAt,
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.currentVoltageV != null,
    }),
    temperatureC: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('temperatureC', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.temperatureC != null,
    }),
    isCharging: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('isCharging', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.isCharging != null,
    }),
    chargingCableConnected: buildBatterySignalFreshness({
      observedAt: resolveHvObservedAt('cableConnected', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
      source: hvSource,
      hasValue: input.hvValues.chargingCableConnected != null,
    }),
    providerSohPercent: buildBatterySignalFreshness({
      observedAt: input.providerSohObservedAt ?? resolveHvObservedAt('providerSoh', input),
      receivedAt: input.receivedAt,
      now: input.now,
      maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.providerSohObservation,
      source: 'DIMO_PROVIDER_SIGNAL',
      hasValue: input.hvValues.providerSohPercent != null,
    }),
  };

  if (!input.isEv) {
    for (const key of Object.keys(hv) as Array<keyof typeof hv>) {
      hv[key] = buildBatterySignalFreshness({
        observedAt: null,
        receivedAt: input.receivedAt,
        now: input.now,
        maxAgeMs: BATTERY_SIGNAL_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
        source: 'UNKNOWN',
        hasValue: false,
      });
    }
  }

  const staleError = (
    freshness: BatterySignalFreshness,
    module: string,
    hasValue: boolean,
  ): BatterySignalError | null => {
    if (freshness.freshnessState === 'STALE' && hasValue) {
      return { code: 'STALE', labelDe: 'Messwert veraltet', module, recoverable: true };
    }
    if (freshness.freshnessState === 'NO_MEASUREMENT') {
      return {
        code: 'NO_MEASUREMENT',
        labelDe: 'Keine Messung verfügbar',
        module,
        recoverable: true,
      };
    }
    return null;
  };

  const lvSignals = Object.fromEntries(
    LV_LIVE_VALUE_KEYS.map((key) => [
      key,
      buildSignalEnvelope({
        value: input.lvValues[key],
        freshness: lv[key],
        error: staleError(lv[key], `lv.${String(key)}`, input.lvValues[key] != null),
      }),
    ]),
  ) as CanonicalBatterySignalFreshnessResult['lvSignals'];

  const hvSignals = Object.fromEntries(
    HV_LIVE_VALUE_KEYS.map((key) => [
      key,
      buildSignalEnvelope({
        value: input.hvValues[key],
        freshness: hv[key],
        error: input.isEv
          ? staleError(hv[key], `hv.${String(key)}`, input.hvValues[key] != null)
          : null,
      }),
    ]),
  ) as CanonicalBatterySignalFreshnessResult['hvSignals'];

  return { live: { lv, hv }, namedSlices, lvSignals, hvSignals };
}

export function collectCapabilitySignalErrors(input: {
  lvUnsupported: boolean;
  lvAssessmentAllowed: boolean;
  hvUnsupportedReasons: Array<{ code: string; labelDe: string }>;
  isEv: boolean;
}): BatterySignalError[] {
  const errors: BatterySignalError[] = [];
  if (input.lvUnsupported) {
    errors.push({
      code: 'UNSUPPORTED',
      labelDe: 'LV-Bewertung für Fahrzeugprofil nicht unterstützt',
      module: 'lvCanonical',
      recoverable: false,
    });
  }
  if (!input.lvAssessmentAllowed) {
    errors.push({
      code: 'CAPABILITY_UNAVAILABLE',
      labelDe: 'LV-Bewertung durch Policy nicht erlaubt',
      module: 'batteryPolicy',
      recoverable: false,
    });
  }
  for (const reason of input.hvUnsupportedReasons) {
    errors.push({
      code: reason.code === 'signal_query_error' ? 'PROVIDER_ERROR' : 'UNSUPPORTED',
      labelDe: reason.labelDe,
      module: 'hvMethodProfile',
      recoverable: reason.code === 'signal_query_error',
    });
  }
  if (!input.isEv) {
    errors.push({
      code: 'UNSUPPORTED',
      labelDe: 'HV-Traction-Battery für Nicht-EV-Profil nicht anwendbar',
      module: 'hv',
      recoverable: false,
    });
  }
  return errors;
}
