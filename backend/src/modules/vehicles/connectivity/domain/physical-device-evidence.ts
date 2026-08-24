/**
 * Canonical physical-device evidence ordering for connectivity runtime.
 *
 * Rule: persist evidence, derive current state — newest trustworthy evidence wins.
 * - Valid telemetry snapshot = positive connected / communicating evidence
 * - OBD_DEVICE_UNPLUGGED event = explicit physical disconnect evidence
 */
import { classifyTelemetryFreshness, type TelemetryFreshness } from '../../vehicle-state-interpreter';
import {
  ConnectivityReasonCode,
  PhysicalDeviceState,
  type PhysicalDeviceState as PhysicalDeviceStateType,
} from './connectivity-domain.types';

export type PhysicalDeviceWinningEvidence = 'snapshot' | 'unplug_event' | 'none';

export interface PhysicalDeviceEvidenceInput {
  latestValidSnapshotAt: Date | string | null;
  latestAcceptedUnplugEventAt: Date | string | null;
  /** When false, physical OBD semantics do not apply. */
  physicalObdApplicable: boolean;
  nowMs: number;
}

export interface PhysicalDeviceEvidenceResult {
  physicalDeviceState: PhysicalDeviceStateType;
  reasonCodes: ConnectivityReasonCode[];
  winningEvidence: PhysicalDeviceWinningEvidence;
  latestValidSnapshotAt: string | null;
  latestExplicitUnplugAt: string | null;
  telemetryFreshness: TelemetryFreshness;
}

function parseEvidenceAt(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Derive physical device state from ordered snapshot vs unplug evidence.
 */
export function derivePhysicalDeviceEvidence(
  input: PhysicalDeviceEvidenceInput,
): PhysicalDeviceEvidenceResult {
  const reasonCodes: ConnectivityReasonCode[] = [];
  const snapshotAt = parseEvidenceAt(input.latestValidSnapshotAt);
  const unplugAt = parseEvidenceAt(input.latestAcceptedUnplugEventAt);
  const telemetryFreshness = classifyTelemetryFreshness(snapshotAt, input.nowMs);

  if (!input.physicalObdApplicable) {
    return {
      physicalDeviceState: PhysicalDeviceState.NOT_APPLICABLE,
      reasonCodes,
      winningEvidence: 'none',
      latestValidSnapshotAt: toIso(snapshotAt),
      latestExplicitUnplugAt: toIso(unplugAt),
      telemetryFreshness,
    };
  }

  if (snapshotAt && unplugAt) {
    if (snapshotAt.getTime() > unplugAt.getTime()) {
      reasonCodes.push(ConnectivityReasonCode.DEVICE_RECONNECTED_SNAPSHOT);
      return {
        physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
        reasonCodes,
        winningEvidence: 'snapshot',
        latestValidSnapshotAt: toIso(snapshotAt),
        latestExplicitUnplugAt: toIso(unplugAt),
        telemetryFreshness,
      };
    }

    reasonCodes.push(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);
    return {
      physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      reasonCodes,
      winningEvidence: 'unplug_event',
      latestValidSnapshotAt: toIso(snapshotAt),
      latestExplicitUnplugAt: toIso(unplugAt),
      telemetryFreshness,
    };
  }

  if (unplugAt) {
    reasonCodes.push(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);
    return {
      physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
      reasonCodes,
      winningEvidence: 'unplug_event',
      latestValidSnapshotAt: toIso(snapshotAt),
      latestExplicitUnplugAt: toIso(unplugAt),
      telemetryFreshness,
    };
  }

  if (snapshotAt) {
    if (telemetryFreshness === 'offline' || telemetryFreshness === 'no_signal') {
      reasonCodes.push(ConnectivityReasonCode.TELEMETRY_OFFLINE);
      reasonCodes.push(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED);
      return {
        physicalDeviceState: PhysicalDeviceState.UNKNOWN,
        reasonCodes,
        winningEvidence: 'none',
        latestValidSnapshotAt: toIso(snapshotAt),
        latestExplicitUnplugAt: null,
        telemetryFreshness,
      };
    }

    reasonCodes.push(ConnectivityReasonCode.DEVICE_RECONNECTED_SNAPSHOT);
    return {
      physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
      reasonCodes,
      winningEvidence: 'snapshot',
      latestValidSnapshotAt: toIso(snapshotAt),
      latestExplicitUnplugAt: null,
      telemetryFreshness,
    };
  }

  if (telemetryFreshness === 'offline' || telemetryFreshness === 'no_signal') {
    reasonCodes.push(ConnectivityReasonCode.TELEMETRY_OFFLINE);
    reasonCodes.push(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED);
  }

  return {
    physicalDeviceState: PhysicalDeviceState.UNKNOWN,
    reasonCodes,
    winningEvidence: 'none',
    latestValidSnapshotAt: null,
    latestExplicitUnplugAt: null,
    telemetryFreshness,
  };
}

/** Map runtime physical state to compact device-connection read-model status. */
export function physicalDeviceStateToConnectionStatus(
  state: PhysicalDeviceStateType,
): 'plugged' | 'unplugged' | 'unknown' {
  switch (state) {
    case PhysicalDeviceState.PLUGGED_CONFIRMED:
    case PhysicalDeviceState.PLUGGED_INFERRED:
      return 'plugged';
    case PhysicalDeviceState.UNPLUGGED_CONFIRMED:
      return 'unplugged';
    default:
      return 'unknown';
  }
}
