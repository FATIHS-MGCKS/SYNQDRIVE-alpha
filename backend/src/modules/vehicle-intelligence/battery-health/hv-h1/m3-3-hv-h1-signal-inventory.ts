import { BATTERY_CAPABILITY_SIGNALS, RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { BOOLEAN_SIGNAL_SPECS, SIGNAL_SPECS } from '../../../dimo/mappers/dimo-battery-signal.mapper';

export const HV_MAPPER_ONLY_DIMO_SIGNAL = 'powertrainTractionBatteryCurrentVoltage' as const;

export const M3_3_HV_H1_SIGNAL_CLASSIFICATIONS = [
  'AVAILABLE_VERIFIED',
  'AVAILABLE_STALE',
  'AVAILABLE_NULL',
  'PROVIDER_DEPENDENT',
  'DERIVABLE',
  'CONTEXT_ONLY',
  'UNAVAILABLE',
  'UNKNOWN_NEEDS_PROVIDER_AUDIT',
] as const;

export type M3_3HvH1SignalClassification =
  (typeof M3_3_HV_H1_SIGNAL_CLASSIFICATIONS)[number];

export interface M3_3HvH1SignalInventoryEntry {
  signalKey: string;
  providerSignal: string;
  registryPresent: boolean;
  mapperPresent: boolean;
  measurementType: string | null;
  unit: string | null;
  valueRange: string | null;
  providerCapabilityGated: boolean;
  providerTimestampAvailable: boolean;
  collectionTimestampFallbackAllowed: boolean;
  persisted: boolean;
  persistenceTarget: string;
  h1Classification: M3_3HvH1SignalClassification;
  qualityAuthority: string;
  freshnessAuthority: string;
}

function unitForDimoSignal(dimoSignalName: string): string | null {
  for (const key of Object.keys(SIGNAL_SPECS) as (keyof typeof SIGNAL_SPECS)[]) {
    const spec = SIGNAL_SPECS[key];
    if (spec.dimoSignalName === dimoSignalName) {
      return spec.targetUnit;
    }
  }
  if (dimoSignalName.includes('IsCharging') || dimoSignalName.includes('CableConnected')) {
    return 'boolean';
  }
  return null;
}

function rangeForDimoSignal(dimoSignalName: string): string | null {
  for (const key of Object.keys(SIGNAL_SPECS) as (keyof typeof SIGNAL_SPECS)[]) {
    const spec = SIGNAL_SPECS[key];
    if (spec.dimoSignalName === dimoSignalName) {
      if (spec.min != null && spec.max != null) {
        return `[${spec.min}, ${spec.max}] ${spec.targetUnit}`;
      }
      return null;
    }
  }
  return null;
}

function defaultClassification(signalKey: string): M3_3HvH1SignalClassification {
  if (signalKey === 'hv.pack_temperature' || signalKey === 'hv.gross_capacity') {
    return 'PROVIDER_DEPENDENT';
  }
  if (signalKey === 'hv.added_energy') {
    return 'DERIVABLE';
  }
  if (signalKey === 'hv.is_charging' || signalKey === 'hv.cable_connected' || signalKey === 'hv.charge_limit') {
    return 'CONTEXT_ONLY';
  }
  if (signalKey === 'dimo.segments.recharge') {
    return 'PROVIDER_DEPENDENT';
  }
  return 'AVAILABLE_VERIFIED';
}

const MAPPER_DIMO_NAMES = new Set<string>(
  (Object.keys(SIGNAL_SPECS) as (keyof typeof SIGNAL_SPECS)[]).map(
    (key) => SIGNAL_SPECS[key].dimoSignalName,
  ),
);

export function buildM3_3HvH1SignalInventory(): M3_3HvH1SignalInventoryEntry[] {
  const hvRegistry = BATTERY_CAPABILITY_SIGNALS.filter((d) => d.signalKey !== 'lv.voltage');
  const entries: M3_3HvH1SignalInventoryEntry[] = hvRegistry.map((def) => ({
    signalKey: def.signalKey,
    providerSignal: def.dimoSignalName,
    registryPresent: true,
    mapperPresent:
      def.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY ||
      MAPPER_DIMO_NAMES.has(def.dimoSignalName),
    measurementType: def.measurementType,
    unit: unitForDimoSignal(def.dimoSignalName),
    valueRange: rangeForDimoSignal(def.dimoSignalName),
    providerCapabilityGated: def.signalKey !== 'dimo.segments.recharge',
    providerTimestampAvailable: def.measurementType != null || def.signalKey.startsWith('hv.'),
    collectionTimestampFallbackAllowed: def.signalKey !== 'dimo.segments.recharge',
    persisted: true,
    persistenceTarget: 'vehicle_battery_capabilities',
    h1Classification: defaultClassification(def.signalKey),
    qualityAuthority: 'VehicleBatteryCapability.status + HvMethodProfile',
    freshnessAuthority: 'sourceTimestamp > lastSeenAt > checkedAt (capability preflight)',
  }));

  entries.push({
    signalKey: 'hv.mapper.current_voltage',
    providerSignal: HV_MAPPER_ONLY_DIMO_SIGNAL,
    registryPresent: false,
    mapperPresent: true,
    measurementType: null,
    unit: unitForDimoSignal(HV_MAPPER_ONLY_DIMO_SIGNAL),
    valueRange: rangeForDimoSignal(HV_MAPPER_ONLY_DIMO_SIGNAL),
    providerCapabilityGated: false,
    providerTimestampAvailable: true,
    collectionTimestampFallbackAllowed: true,
    persisted: false,
    persistenceTarget: 'none (mapper-only; optional BatteryMeasurement path)',
    h1Classification: 'UNKNOWN_NEEDS_PROVIDER_AUDIT',
    qualityAuthority: 'BatteryMeasurement when ingested; no capability row',
    freshnessAuthority: 'per-signal provider timestamp on poll map',
  });

  return entries;
}

export const HV_REGISTRY_KEY_COUNT = BATTERY_CAPABILITY_SIGNALS.filter(
  (d) => d.signalKey !== 'lv.voltage',
).length;

export const HV_MAPPER_FIELD_COUNT =
  (Object.keys(SIGNAL_SPECS).length - 1) + Object.keys(BOOLEAN_SIGNAL_SPECS).length;

export const HV_DISTINCT_CURRENT_SURFACE_COUNT = 13;
