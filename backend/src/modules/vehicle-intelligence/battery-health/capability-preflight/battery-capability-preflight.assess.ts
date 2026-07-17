import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  BATTERY_CAPABILITY_SIGNALS,
  RECHARGE_SEGMENTS_SIGNAL_KEY,
} from './battery-capability-signals.registry';
import {
  BatteryCapabilityPreflightStatus,
  type AssessedBatteryCapabilitySignal,
  type BatteryCapabilityPreflightInput,
  type RechargeSegmentsProbeResult,
} from './battery-capability-preflight.types';

export const DEFAULT_CAPABILITY_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

interface SignalFieldSnapshot {
  value: number | null;
  timestamp: Date | null;
  source: string | null;
  inAvailableList: boolean;
}

function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function readSignalField(
  signalsLatest: Record<string, unknown> | null,
  dimoSignalName: string,
): SignalFieldSnapshot | null {
  if (!signalsLatest) return null;
  const field = signalsLatest[dimoSignalName];
  if (field == null) return null;

  if (typeof field !== 'object') {
    return {
      value: typeof field === 'number' && !Number.isNaN(field) ? field : null,
      timestamp: null,
      source: null,
      inAvailableList: false,
    };
  }

  const record = field as Record<string, unknown>;
  const rawValue = record.value;
  const value =
    rawValue != null && typeof rawValue === 'number' && !Number.isNaN(rawValue)
      ? rawValue
      : null;

  return {
    value,
    timestamp: parseTimestamp(record.timestamp),
    source: typeof record.source === 'string' ? record.source : null,
    inAvailableList: false,
  };
}

export function mapPreflightStatusToPersistence(
  status: BatteryCapabilityPreflightStatus,
): BatteryCapabilityStatus {
  switch (status) {
    case BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA:
      return BatteryCapabilityStatus.AVAILABLE;
    case BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL:
      return BatteryCapabilityStatus.AVAILABLE_NULL;
    case BatteryCapabilityPreflightStatus.STALE:
      return BatteryCapabilityStatus.AVAILABLE_STALE;
    case BatteryCapabilityPreflightStatus.NOT_LISTED:
      return BatteryCapabilityStatus.NOT_LISTED;
    case BatteryCapabilityPreflightStatus.QUERY_ERROR:
    default:
      return BatteryCapabilityStatus.QUERY_ERROR;
  }
}

export function classifySignalCapability(
  field: SignalFieldSnapshot | null,
  lastSeen: Date | null,
  options: {
    queryError?: string | null;
    staleThresholdMs: number;
    checkedAt: Date;
  },
): BatteryCapabilityPreflightStatus {
  if (options.queryError) {
    return BatteryCapabilityPreflightStatus.QUERY_ERROR;
  }
  if (!field) {
    return BatteryCapabilityPreflightStatus.NOT_LISTED;
  }
  if (!field.inAvailableList && field.value == null) {
    return BatteryCapabilityPreflightStatus.NOT_LISTED;
  }
  if (field.value == null) {
    return BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL;
  }

  const signalTs = field.timestamp?.getTime() ?? null;
  const lastSeenTs = lastSeen?.getTime() ?? null;
  if (
    signalTs != null &&
    lastSeenTs != null &&
    lastSeenTs - signalTs > options.staleThresholdMs
  ) {
    return BatteryCapabilityPreflightStatus.STALE;
  }

  return BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA;
}

export function assessRechargeSegmentsCapability(
  probe: RechargeSegmentsProbeResult,
  checkedAt: Date,
): AssessedBatteryCapabilitySignal {
  const definition = BATTERY_CAPABILITY_SIGNALS.find(
    (entry) => entry.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY,
  )!;

  let preflightStatus: BatteryCapabilityPreflightStatus;
  if (probe.queryError) {
    preflightStatus = BatteryCapabilityPreflightStatus.QUERY_ERROR;
  } else if (probe.segmentCount > 0) {
    preflightStatus = BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA;
  } else {
    preflightStatus = BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL;
  }

  return {
    signalKey: definition.signalKey,
    signalName: definition.signalName,
    provider: definition.provider,
    preflightStatus,
    persistenceStatus: mapPreflightStatusToPersistence(preflightStatus),
    measurementType: definition.measurementType,
    lastSeenAt: probe.lastSeenAt ?? null,
    firstSeenAt: probe.firstSeenAt ?? null,
    sourceTimestamp: probe.lastSeenAt ?? null,
    lastValue: probe.segmentCount > 0 ? probe.segmentCount : null,
    metadata: {
      preflightStatus,
      probe: 'dimo.segments.recharge',
      segmentCount: probe.segmentCount,
      checkedAt: checkedAt.toISOString(),
      ...(probe.queryError ? { queryError: probe.queryError } : {}),
    },
  };
}

export function assessBatteryCapabilityPreflight(
  input: BatteryCapabilityPreflightInput,
): AssessedBatteryCapabilitySignal[] {
  const checkedAt = input.checkedAt ?? new Date();
  const staleThresholdMs =
    input.staleThresholdMs ?? DEFAULT_CAPABILITY_STALE_THRESHOLD_MS;
  const availableSet = new Set(input.availableSignals ?? []);
  const signalsLatest = input.signalsLatest;
  const collectionLastSeen = parseTimestamp(signalsLatest?.lastSeen);

  return BATTERY_CAPABILITY_SIGNALS.filter(
    (definition) => definition.signalKey !== RECHARGE_SEGMENTS_SIGNAL_KEY,
  ).map((definition) => {
    const field = readSignalField(signalsLatest, definition.dimoSignalName);
    const enrichedField =
      field == null
        ? null
        : { ...field, inAvailableList: availableSet.has(definition.dimoSignalName) };

    const preflightStatus = classifySignalCapability(
      enrichedField,
      collectionLastSeen,
      {
        queryError: input.queryError,
        staleThresholdMs,
        checkedAt,
      },
    );

    const sourceTimestamp = enrichedField?.timestamp ?? null;
    const lastSeenAt = sourceTimestamp ?? collectionLastSeen;
    const lastValue = enrichedField?.value ?? null;

    return {
      signalKey: definition.signalKey,
      signalName: definition.signalName,
      provider: enrichedField?.source ?? definition.provider,
      preflightStatus,
      persistenceStatus: mapPreflightStatusToPersistence(preflightStatus),
      measurementType: definition.measurementType,
      lastSeenAt,
      firstSeenAt: lastSeenAt,
      sourceTimestamp,
      lastValue,
      metadata: {
        preflightStatus,
        dimoSignalName: definition.dimoSignalName,
        inAvailableSignals: availableSet.has(definition.dimoSignalName),
        checkedAt: checkedAt.toISOString(),
        staleThresholdMs,
        ...(input.queryError ? { queryError: input.queryError } : {}),
      },
    };
  });
}
