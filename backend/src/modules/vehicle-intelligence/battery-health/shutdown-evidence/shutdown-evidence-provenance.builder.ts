import type { VehicleLatestState, VehicleTripDetectionState } from '@prisma/client';
import {
  DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V,
  isChargingContext,
} from '../lv-rest-window/lv-rest-window.policy';
import type { BatteryObservationSnapshotContext } from '../jobs/battery-v2-snapshot-context.types';
import {
  SHUTDOWN_TIMESTAMP_SOURCES,
  SHUTDOWN_VLS_SHARED_SNAPSHOT_FIELDS,
  type ShutdownTimestampSource,
} from './shutdown-evidence.constants';
import { deriveEngineRunningFromLoad } from './shutdown-evidence-classification.policy';
import type { ShutdownEvidenceFieldBundle } from './shutdown-evidence.types';

export interface ResolvedProviderLvTimestamp {
  providerObservationAt: Date | null;
  effectiveCaptureReferenceAt: Date;
  voltageObservedAt: Date | null;
  voltageTimestampSource: ShutdownTimestampSource;
}

export interface ResolvedVlsSharedSnapshotTimestamp {
  observedAt: Date | null;
  source: ShutdownTimestampSource;
}

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * DIMO VLS sourceTimestamp is the shared snapshot lastSeenAt — not an independent
 * per-field provider timestamp. See dimo-snapshot.processor (sourceTimestamp = lastSeenAt).
 */
export function resolveVlsSharedSnapshotTimestamp(
  vls: Pick<VehicleLatestState, 'sourceTimestamp' | 'providerFetchedAt'> | null,
): ResolvedVlsSharedSnapshotTimestamp {
  if (!vls) {
    return {
      observedAt: null,
      source: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
    };
  }
  if (vls.sourceTimestamp && !Number.isNaN(vls.sourceTimestamp.getTime())) {
    return {
      observedAt: vls.sourceTimestamp,
      source: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    };
  }
  if (vls.providerFetchedAt && !Number.isNaN(vls.providerFetchedAt.getTime())) {
    return {
      observedAt: vls.providerFetchedAt,
      source: SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT,
    };
  }
  return {
    observedAt: null,
    source: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
  };
}

export function resolveProviderLvTimestamp(input: {
  lvBatteryObservedAt: string | null | undefined;
  ingestedAt: Date;
}): ResolvedProviderLvTimestamp {
  const providerObservationAt = parseIso(input.lvBatteryObservedAt) ?? null;
  const effectiveCaptureReferenceAt = providerObservationAt ?? input.ingestedAt;

  if (providerObservationAt) {
    return {
      providerObservationAt,
      effectiveCaptureReferenceAt,
      voltageObservedAt: providerObservationAt,
      voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    };
  }

  return {
    providerObservationAt: null,
    effectiveCaptureReferenceAt,
    voltageObservedAt: null,
    voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN,
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
}): {
  fields: ShutdownEvidenceFieldBundle;
  sourceSnapshotId: string | null;
  providerLv: ResolvedProviderLvTimestamp;
  vlsSharedSnapshot: ResolvedVlsSharedSnapshotTimestamp;
} {
  const ctx = input.snapshotContext;
  const providerLv = resolveProviderLvTimestamp({
    lvBatteryObservedAt: ctx.lvBatteryObservedAt,
    ingestedAt: input.ingestedAt,
  });
  const vlsSharedSnapshot = resolveVlsSharedSnapshotTimestamp(input.vls);

  const voltage = ctx.lvBatteryVoltage ?? null;
  const engineRunning = deriveEngineRunningFromLoad(input.vls?.engineLoad ?? null);
  const isHvCharging =
    input.vls?.tractionBatteryIsCharging === true ||
    (input.vls?.tractionBatteryChargingPowerKw ?? 0) > 0;
  const signalLike = {
    observedAt: providerLv.voltageObservedAt ?? providerLv.effectiveCaptureReferenceAt,
    providerObservedAt: providerLv.voltageObservedAt,
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

  const sharedObservedAt = vlsSharedSnapshot.observedAt;
  const sharedSource = vlsSharedSnapshot.source;

  return {
    sourceSnapshotId: input.vls?.syncJobRef ?? null,
    providerLv,
    vlsSharedSnapshot,
    fields: {
      voltage,
      voltageObservedAt: providerLv.voltageObservedAt,
      voltageTimestampSource: providerLv.voltageTimestampSource,

      speedKmh: signalLike.speedKmh,
      speedObservedAt: sharedObservedAt,
      speedTimestampSource: sharedSource,

      ignitionOn: signalLike.ignitionOn,
      ignitionObservedAt: sharedObservedAt,
      ignitionTimestampSource: sharedSource,

      engineRunning: signalLike.engineRunning,
      engineRunningObservedAt: sharedObservedAt,
      engineRunningTimestampSource: sharedSource,

      isLvCharging: signalLike.isLvCharging,
      isHvCharging: signalLike.isHvCharging,
      chargingContextObservedAt: sharedObservedAt,
      chargingContextTimestampSource: sharedSource,

      activeTrip: signalLike.hasActiveTrip,
      activeTripObservedAt: input.ingestedAt,
      activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,

      vehicleOnline: input.vls?.online ?? null,
      vehicleOnlineObservedAt: input.vls?.lastSeenAt ?? sharedObservedAt,
      providerLastSeenAt: input.vls?.lastSeenAt ?? null,
    },
  };
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
  const vlsSharedSnapshot = resolveVlsSharedSnapshotTimestamp(input.vls);
  const tripEndMs = input.tripEndedAt.getTime();
  const age = (at: Date | null | undefined) =>
    at != null && !Number.isNaN(at.getTime()) ? tripEndMs - at.getTime() : null;

  const engineRunning = deriveEngineRunningFromLoad(input.vls?.engineLoad ?? null);
  const isHvCharging =
    input.vls?.tractionBatteryIsCharging === true ||
    (input.vls?.tractionBatteryChargingPowerKw ?? 0) > 0;
  const lvVoltage = input.vls?.lvBatteryVoltage ?? null;
  const isLvCharging =
    lvVoltage != null && lvVoltage >= DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V;

  const sharedObservedAt = vlsSharedSnapshot.observedAt;
  const sharedSource = vlsSharedSnapshot.source;

  return {
    tripId: input.tripId,
    vehicleId: input.vehicleId,
    tripEndedAt: input.tripEndedAt.toISOString(),
    capturedAt: input.capturedAt.toISOString(),
    atomicClaim: false as const,
    vlsSharedSnapshotTimestamp: {
      observedAt: sharedObservedAt?.toISOString() ?? null,
      timestampSource: sharedSource,
      sharedFields: [...SHUTDOWN_VLS_SHARED_SNAPSHOT_FIELDS, 'voltage'],
    },
    fields: {
      voltage: fieldSnapshot(
        lvVoltage,
        sharedObservedAt,
        sharedSource,
        age(sharedObservedAt),
      ),
      speedKmh: fieldSnapshot(
        input.vls?.speedKmh ?? null,
        sharedObservedAt,
        sharedSource,
        age(sharedObservedAt),
      ),
      ignitionOn: fieldSnapshot(
        input.vls?.isIgnitionOn ?? null,
        sharedObservedAt,
        sharedSource,
        age(sharedObservedAt),
      ),
      engineRunning: fieldSnapshot(
        engineRunning,
        sharedObservedAt,
        sharedSource,
        age(sharedObservedAt),
      ),
      chargingContext: fieldSnapshot(
        { isLvCharging, isHvCharging },
        sharedObservedAt,
        sharedSource,
        age(sharedObservedAt),
      ),
      vehicleOnline: fieldSnapshot(
        input.vls?.online ?? null,
        input.vls?.lastSeenAt ?? sharedObservedAt,
        input.vls?.lastSeenAt
          ? SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP
          : sharedSource,
        age(input.vls?.lastSeenAt ?? sharedObservedAt),
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
