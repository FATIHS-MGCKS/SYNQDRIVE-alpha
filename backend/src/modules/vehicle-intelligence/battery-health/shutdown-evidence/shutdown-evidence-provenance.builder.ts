import type { VehicleLatestState, VehicleTripDetectionState } from '@prisma/client';
import {
  DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V,
  isChargingContext,
} from '../lv-rest-window/lv-rest-window.policy';
import type { BatteryObservationSnapshotContext } from '../jobs/battery-v2-snapshot-context.types';
import {
  SHUTDOWN_TIMESTAMP_SOURCES,
  type ShutdownTimestampSource,
} from './shutdown-evidence.constants';
import {
  deriveEngineRunningFromLoad,
} from './shutdown-evidence-classification.policy';
import type { ShutdownEvidenceFieldBundle } from './shutdown-evidence.types';

function resolveVlsFieldTimestamp(
  vls: Pick<VehicleLatestState, 'sourceTimestamp' | 'providerFetchedAt'>,
  ingestedAt: Date,
): { observedAt: Date; source: ShutdownTimestampSource } {
  if (vls.sourceTimestamp && !Number.isNaN(vls.sourceTimestamp.getTime())) {
    return {
      observedAt: vls.sourceTimestamp,
      source: SHUTDOWN_TIMESTAMP_SOURCES.VLS_SOURCE_TIMESTAMP,
    };
  }
  if (vls.providerFetchedAt && !Number.isNaN(vls.providerFetchedAt.getTime())) {
    return {
      observedAt: vls.providerFetchedAt,
      source: SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT,
    };
  }
  return {
    observedAt: ingestedAt,
    source: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,
  };
}

export function buildShutdownFieldBundleFromSnapshotIngest(input: {
  snapshotContext: BatteryObservationSnapshotContext;
  vls: Pick<
    VehicleLatestState,
    | 'speedKmh'
    | 'isIgnitionOn'
    | 'engineLoad'
    | 'tractionBatteryIsCharging'
    | 'tractionBatteryChargingPowerKw'
    | 'online'
    | 'lastSeenAt'
    | 'sourceTimestamp'
    | 'providerFetchedAt'
    | 'syncJobRef'
  > | null;
  tripDetection: Pick<
    VehicleTripDetectionState,
    'activeTripId' | 'lastActivityAt'
  > | null;
  ingestedAt: Date;
}): { fields: ShutdownEvidenceFieldBundle; sourceSnapshotId: string | null } {
  const ctx = input.snapshotContext;
  const voltageObservedAt = parseIso(ctx.lvBatteryObservedAt) ?? input.ingestedAt;
  const vlsBundle = input.vls
    ? resolveVlsFieldTimestamp(input.vls, input.ingestedAt)
    : { observedAt: input.ingestedAt, source: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN as ShutdownTimestampSource };

  const voltage = ctx.lvBatteryVoltage ?? null;
  const engineRunning = deriveEngineRunningFromLoad(input.vls?.engineLoad ?? null);
  const isHvCharging =
    input.vls?.tractionBatteryIsCharging === true ||
    (input.vls?.tractionBatteryChargingPowerKw ?? 0) > 0;
  const signalLike = {
    observedAt: voltageObservedAt,
    providerObservedAt: voltageObservedAt,
    providerError: false,
    speedKmh: input.vls?.speedKmh ?? null,
    ignitionOn: input.vls?.isIgnitionOn ?? null,
    engineRunning,
    hasActiveTrip: input.tripDetection?.activeTripId != null,
    isLvCharging: voltage != null && voltage >= DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V,
    isHvCharging,
    lvVoltage: voltage,
    lastActivityAt: input.tripDetection?.lastActivityAt ?? null,
    tripEndAt: input.tripDetection?.lastActivityAt ?? null,
    tripId: input.tripDetection?.activeTripId ?? null,
  };
  if (isChargingContext(signalLike)) {
    signalLike.isLvCharging = true;
  }

  return {
    sourceSnapshotId: input.vls?.syncJobRef ?? null,
    fields: {
      voltage,
      voltageObservedAt,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SIGNAL_TIMESTAMP,

      speedKmh: signalLike.speedKmh,
      speedObservedAt: vlsBundle.observedAt,
      speedTimestampSource: vlsBundle.source,

      ignitionOn: signalLike.ignitionOn,
      ignitionObservedAt: vlsBundle.observedAt,
      ignitionTimestampSource: vlsBundle.source,

      engineRunning: signalLike.engineRunning,
      engineRunningObservedAt: vlsBundle.observedAt,
      engineRunningTimestampSource: vlsBundle.source,

      isLvCharging: signalLike.isLvCharging,
      isHvCharging: signalLike.isHvCharging,
      chargingContextObservedAt: vlsBundle.observedAt,
      chargingContextTimestampSource: vlsBundle.source,

      activeTrip: signalLike.hasActiveTrip,
      activeTripObservedAt: input.ingestedAt,
      activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,

      vehicleOnline: input.vls?.online ?? null,
      vehicleOnlineObservedAt: input.vls?.lastSeenAt ?? vlsBundle.observedAt,
      providerLastSeenAt: input.vls?.lastSeenAt ?? null,
    },
  };
}

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function buildTripShutdownContextSnapshotFields(input: {
  tripId: string;
  vehicleId: string;
  tripEndedAt: Date;
  capturedAt: Date;
  vls: Pick<
    VehicleLatestState,
    | 'lvBatteryVoltage'
    | 'speedKmh'
    | 'isIgnitionOn'
    | 'engineLoad'
    | 'tractionBatteryIsCharging'
    | 'tractionBatteryChargingPowerKw'
    | 'online'
    | 'lastSeenAt'
    | 'sourceTimestamp'
    | 'providerFetchedAt'
  > | null;
  tripDetection: Pick<VehicleTripDetectionState, 'activeTripId'> | null;
}) {
  const vlsTs = input.vls
    ? resolveVlsFieldTimestamp(input.vls, input.capturedAt)
    : { observedAt: input.capturedAt, source: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN as ShutdownTimestampSource };

  const tripEndMs = input.tripEndedAt.getTime();
  const age = (at: Date | null | undefined) =>
    at != null && !Number.isNaN(at.getTime()) ? tripEndMs - at.getTime() : null;

  const voltageObservedAt =
    input.vls?.sourceTimestamp ?? input.vls?.providerFetchedAt ?? null;
  const engineRunning = deriveEngineRunningFromLoad(input.vls?.engineLoad ?? null);
  const isHvCharging =
    input.vls?.tractionBatteryIsCharging === true ||
    (input.vls?.tractionBatteryChargingPowerKw ?? 0) > 0;
  const lvVoltage = input.vls?.lvBatteryVoltage ?? null;
  const isLvCharging =
    lvVoltage != null && lvVoltage >= DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V;

  return {
    tripId: input.tripId,
    vehicleId: input.vehicleId,
    tripEndedAt: input.tripEndedAt.toISOString(),
    capturedAt: input.capturedAt.toISOString(),
    atomicClaim: false as const,
    fields: {
      voltage: fieldSnapshot(lvVoltage, voltageObservedAt, SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SIGNAL_TIMESTAMP, age(voltageObservedAt)),
      speedKmh: fieldSnapshot(input.vls?.speedKmh ?? null, vlsTs.observedAt, vlsTs.source, age(vlsTs.observedAt)),
      ignitionOn: fieldSnapshot(input.vls?.isIgnitionOn ?? null, vlsTs.observedAt, vlsTs.source, age(vlsTs.observedAt)),
      engineRunning: fieldSnapshot(engineRunning, vlsTs.observedAt, vlsTs.source, age(vlsTs.observedAt)),
      chargingContext: fieldSnapshot(
        { isLvCharging, isHvCharging },
        vlsTs.observedAt,
        vlsTs.source,
        age(vlsTs.observedAt),
      ),
      vehicleOnline: fieldSnapshot(
        input.vls?.online ?? null,
        input.vls?.lastSeenAt ?? vlsTs.observedAt,
        input.vls?.lastSeenAt ? SHUTDOWN_TIMESTAMP_SOURCES.VLS_SOURCE_TIMESTAMP : vlsTs.source,
        age(input.vls?.lastSeenAt ?? vlsTs.observedAt),
      ),
    },
  };
}

function fieldSnapshot(
  value: unknown,
  observedAt: Date | null,
  timestampSource: ShutdownTimestampSource,
  ageMsAtTripEnd: number | null,
) {
  return {
    value,
    observedAt: observedAt?.toISOString() ?? null,
    timestampSource,
    ageMsAtTripEnd,
  };
}
