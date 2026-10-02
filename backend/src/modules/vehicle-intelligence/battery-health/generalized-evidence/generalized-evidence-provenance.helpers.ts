import { BatteryShutdownStateAlignmentClass } from '@prisma/client';
import {
  SHUTDOWN_TIMESTAMP_SOURCES,
  type ShutdownTimestampSource,
} from '../shutdown-evidence/shutdown-evidence.constants';
import type { ResolvedVlsSharedSnapshotTimestamp } from '../shutdown-evidence/shutdown-evidence-provenance.builder';

export function isProviderQualifiedVoltageObservationTime(
  voltageObservedAt: Date | null | undefined,
  voltageTimestampSource: ShutdownTimestampSource,
): boolean {
  return (
    voltageObservedAt != null &&
    !Number.isNaN(voltageObservedAt.getTime()) &&
    voltageTimestampSource === SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP
  );
}

/** Authoritative rest age uses provider LV field time only — never ingest wall clock. */
export function computeActualRestAgeMs(input: {
  sessionAnchorAt: Date;
  voltageObservedAt: Date | null | undefined;
  voltageTimestampSource: ShutdownTimestampSource;
}): number | null {
  if (
    !isProviderQualifiedVoltageObservationTime(
      input.voltageObservedAt,
      input.voltageTimestampSource,
    )
  ) {
    return null;
  }
  return input.voltageObservedAt!.getTime() - input.sessionAnchorAt.getTime();
}

export function resolveSharedVehicleStateObservation(
  vlsSharedSnapshot: ResolvedVlsSharedSnapshotTimestamp,
): {
  stateObservedAt: Date | null;
  stateTimestampSource: ShutdownTimestampSource | null;
} {
  if (
    vlsSharedSnapshot.observedAt != null &&
    !Number.isNaN(vlsSharedSnapshot.observedAt.getTime()) &&
    vlsSharedSnapshot.source !== SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN
  ) {
    return {
      stateObservedAt: vlsSharedSnapshot.observedAt,
      stateTimestampSource: vlsSharedSnapshot.source,
    };
  }
  return { stateObservedAt: null, stateTimestampSource: null };
}

export function isValidRestLadderObservation(input: {
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  actualRestAgeMs: number | null;
}): boolean {
  if (input.actualRestAgeMs == null || input.actualRestAgeMs <= 0) return false;
  return (
    input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.ALIGNED ||
    input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.PARTIAL
  );
}
