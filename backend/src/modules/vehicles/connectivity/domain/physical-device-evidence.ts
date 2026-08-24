/**
 * Canonical physical-device evidence ordering for connectivity runtime.
 *
 * Rule: persist evidence, derive current state — newest trustworthy evidence wins.
 * - Valid telemetry snapshot = positive connected / communicating evidence (when fresh)
 * - OBD_DEVICE_PLUGGED_IN event = positive explicit reconnect evidence
 * - OBD_DEVICE_UNPLUGGED event = explicit physical disconnect evidence
 *
 * Two-step model:
 * A) Historical ordering — did later positive evidence recover an older unplug?
 * B) Current validity — is snapshot-based inference still fresh enough to claim plugged today?
 */
import { classifyTelemetryFreshness, type TelemetryFreshness } from '../../vehicle-state-interpreter';
import {
  ConnectivityReasonCode,
  PhysicalDeviceState,
  type PhysicalDeviceState as PhysicalDeviceStateType,
} from './connectivity-domain.types';

export type PhysicalDeviceWinningEvidence =
  | 'snapshot'
  | 'plug_event'
  | 'unplug_event'
  | 'none';

export interface PhysicalDeviceEvidenceInput {
  latestValidSnapshotAt: Date | string | null;
  latestAcceptedUnplugEventAt: Date | string | null;
  latestAcceptedPlugEventAt?: Date | string | null;
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

type EvidenceKind = 'positive_snapshot' | 'positive_plug' | 'negative_unplug';

interface EvidenceCandidate {
  at: Date;
  kind: EvidenceKind;
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

const EVIDENCE_KIND_PRIORITY: Record<EvidenceKind, number> = {
  positive_plug: 3,
  negative_unplug: 2,
  positive_snapshot: 1,
};

function newestEvidence(candidates: EvidenceCandidate[]): EvidenceCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, candidate) => {
    const deltaMs = candidate.at.getTime() - latest.at.getTime();
    if (deltaMs > 0) return candidate;
    if (deltaMs < 0) return latest;
    return EVIDENCE_KIND_PRIORITY[candidate.kind] > EVIDENCE_KIND_PRIORITY[latest.kind]
      ? candidate
      : latest;
  });
}

function isSnapshotFreshEnoughForPluggedInference(
  snapshotAt: Date | null,
  nowMs: number,
): boolean {
  if (!snapshotAt) return false;
  const freshness = classifyTelemetryFreshness(snapshotAt, nowMs);
  return freshness !== 'offline' && freshness !== 'no_signal';
}

function unknownFromStaleTelemetry(
  snapshotAt: Date | null,
  unplugAt: Date | null,
  telemetryFreshness: TelemetryFreshness,
  reasonCodes: ConnectivityReasonCode[],
): PhysicalDeviceEvidenceResult {
  reasonCodes.push(ConnectivityReasonCode.TELEMETRY_OFFLINE);
  reasonCodes.push(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED);
  return {
    physicalDeviceState: PhysicalDeviceState.UNKNOWN,
    reasonCodes,
    winningEvidence: 'none',
    latestValidSnapshotAt: toIso(snapshotAt),
    latestExplicitUnplugAt: toIso(unplugAt),
    telemetryFreshness,
  };
}

/**
 * Derive physical device state from ordered snapshot, plug, and unplug evidence.
 */
export function derivePhysicalDeviceEvidence(
  input: PhysicalDeviceEvidenceInput,
): PhysicalDeviceEvidenceResult {
  const reasonCodes: ConnectivityReasonCode[] = [];
  const snapshotAt = parseEvidenceAt(input.latestValidSnapshotAt);
  const unplugAt = parseEvidenceAt(input.latestAcceptedUnplugEventAt);
  const plugAt = parseEvidenceAt(input.latestAcceptedPlugEventAt);
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

  const candidates: EvidenceCandidate[] = [];
  const snapshotIsHistoricallyPositive =
    snapshotAt != null &&
    (unplugAt != null ||
      isSnapshotFreshEnoughForPluggedInference(snapshotAt, input.nowMs));
  if (snapshotAt && snapshotIsHistoricallyPositive) {
    candidates.push({ at: snapshotAt, kind: 'positive_snapshot' });
  }
  if (plugAt) candidates.push({ at: plugAt, kind: 'positive_plug' });
  if (unplugAt) candidates.push({ at: unplugAt, kind: 'negative_unplug' });

  const newest = newestEvidence(candidates);
  if (newest) {
    switch (newest.kind) {
      case 'positive_snapshot': {
        if (!isSnapshotFreshEnoughForPluggedInference(snapshotAt, input.nowMs)) {
          return unknownFromStaleTelemetry(snapshotAt, unplugAt, telemetryFreshness, reasonCodes);
        }
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
      case 'positive_plug':
        reasonCodes.push(ConnectivityReasonCode.DEVICE_RECONNECTED_EXPLICIT);
        return {
          physicalDeviceState: PhysicalDeviceState.PLUGGED_CONFIRMED,
          reasonCodes,
          winningEvidence: 'plug_event',
          latestValidSnapshotAt: toIso(snapshotAt),
          latestExplicitUnplugAt: toIso(unplugAt),
          telemetryFreshness,
        };
      case 'negative_unplug':
        reasonCodes.push(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK);
        return {
          physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
          reasonCodes,
          winningEvidence: 'unplug_event',
          latestValidSnapshotAt: toIso(snapshotAt),
          latestExplicitUnplugAt: toIso(unplugAt),
          telemetryFreshness,
        };
      default:
        break;
    }
  }

  if (snapshotAt) {
    if (!isSnapshotFreshEnoughForPluggedInference(snapshotAt, input.nowMs)) {
      return unknownFromStaleTelemetry(snapshotAt, null, telemetryFreshness, reasonCodes);
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
