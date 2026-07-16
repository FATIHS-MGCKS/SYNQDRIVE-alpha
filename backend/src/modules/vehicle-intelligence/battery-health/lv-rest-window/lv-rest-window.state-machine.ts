import {
  buildLvRestWindowIdempotencyKey,
  LvRestWindowEventType,
  LvRestWindowState,
} from '../battery-v2-domain';
import {
  canOpenRestWindowCandidate,
  isValidRestSnapshot,
} from './lv-rest-window.policy';
import type {
  LvRestWindowEvent,
  LvRestWindowPolicyContext,
  LvRestWindowRecord,
  LvRestWindowTransition,
} from './lv-rest-window.types';

const TERMINAL_STATES = new Set<LvRestWindowState>([
  LvRestWindowState.INVALIDATED,
  LvRestWindowState.COMPLETED,
  LvRestWindowState.EXPIRED,
]);

function buildWindowId(vehicleId: string, anchorAt: Date): string {
  return buildLvRestWindowIdempotencyKey(vehicleId, anchorAt);
}

function cloneRecord(record: LvRestWindowRecord): LvRestWindowRecord {
  return { ...record };
}

function invalidate(
  current: LvRestWindowRecord,
  at: Date,
  reason: string,
  eventType: LvRestWindowEventType,
): LvRestWindowRecord {
  return {
    ...current,
    state: LvRestWindowState.INVALIDATED,
    lastTransitionAt: at,
    invalidatedReason: reason,
    lastEventType: eventType,
  };
}

function maybeExpire(
  current: LvRestWindowRecord,
  at: Date,
  policy: LvRestWindowPolicyContext,
): LvRestWindowRecord | null {
  if (TERMINAL_STATES.has(current.state)) return current;
  if (at.getTime() - current.anchorAt.getTime() < policy.maxWindowMs) {
    return null;
  }
  return {
    ...current,
    state: LvRestWindowState.EXPIRED,
    lastTransitionAt: at,
    invalidatedReason: 'rest_window_expired',
    lastEventType: LvRestWindowEventType.REST_WINDOW_EXPIRED,
  };
}

function maybeComplete(
  current: LvRestWindowRecord,
  at: Date,
  policy: LvRestWindowPolicyContext,
): LvRestWindowRecord | null {
  if (current.state !== LvRestWindowState.RESTING) return null;
  if (!current.confirmedRestingAt) return null;
  if (
    at.getTime() - current.confirmedRestingAt.getTime() <
    policy.stabilityDwellMs
  ) {
    return null;
  }
  return {
    ...current,
    state: LvRestWindowState.COMPLETED,
    lastTransitionAt: at,
    lastEventType: LvRestWindowEventType.REST_SNAPSHOT,
  };
}

export function reduceLvRestWindow(
  vehicleId: string,
  current: LvRestWindowRecord | null,
  event: LvRestWindowEvent,
  policy: LvRestWindowPolicyContext,
): LvRestWindowTransition {
  const previous = current ? cloneRecord(current) : null;
  let working = current ? cloneRecord(current) : null;

  if (working && !TERMINAL_STATES.has(working.state)) {
    const expired = maybeExpire(working, event.at, policy);
    if (expired) {
      working = expired;
    }
  }

  if (
    working &&
    !TERMINAL_STATES.has(working.state) &&
    event.type === LvRestWindowEventType.PROVIDER_ERROR
  ) {
    return {
      changed: false,
      previous,
      current: working,
      reason: 'provider_error_ignored_for_open_window',
    };
  }

  switch (event.type) {
    case LvRestWindowEventType.TRIP_ENDED: {
      const gate = canOpenRestWindowCandidate(event.signal, policy);
      if (!gate.ok) {
        return {
          changed: false,
          previous,
          current: working,
          reason: gate.reason,
        };
      }

      const anchorAt = event.signal.lastActivityAt!;
      const windowId = buildWindowId(vehicleId, anchorAt);

      if (
        working &&
        working.windowId === windowId &&
        !TERMINAL_STATES.has(working.state)
      ) {
        return {
          changed: false,
          previous,
          current: working,
          reason: 'duplicate_trip_end_event',
        };
      }

      if (
        working &&
        !TERMINAL_STATES.has(working.state) &&
        working.windowId !== windowId
      ) {
        working = invalidate(
          working,
          event.at,
          'superseded_by_new_trip_end',
          LvRestWindowEventType.TRIP_ENDED,
        );
      }

      const candidate: LvRestWindowRecord = {
        windowId,
        state: LvRestWindowState.CANDIDATE,
        anchorAt,
        startedAt: anchorAt,
        lastTransitionAt: event.at,
        tripId: event.signal.tripId,
        invalidatedReason: null,
        lastEventType: LvRestWindowEventType.TRIP_ENDED,
        confirmedRestingAt: null,
      };

      return {
        changed: true,
        previous,
        current: candidate,
        reason: 'opened_candidate',
      };
    }

    case LvRestWindowEventType.REST_SNAPSHOT: {
      if (!working || TERMINAL_STATES.has(working.state)) {
        return {
          changed: false,
          previous,
          current: working,
          reason: 'no_open_rest_window',
        };
      }

      const snapshot = isValidRestSnapshot(
        event.signal,
        policy,
        working.anchorAt,
      );
      if (!snapshot.ok) {
        if (
          working.state === LvRestWindowState.CANDIDATE &&
          (snapshot.reason === 'wake_voltage' ||
            snapshot.reason === 'charging_context')
        ) {
          const invalidated = invalidate(
            working,
            event.at,
            snapshot.reason,
            LvRestWindowEventType.REST_SNAPSHOT,
          );
          return {
            changed: true,
            previous,
            current: invalidated,
            reason: snapshot.reason,
          };
        }
        return {
          changed: false,
          previous,
          current: working,
          reason: snapshot.reason,
        };
      }

      if (working.state === LvRestWindowState.CANDIDATE) {
        const resting: LvRestWindowRecord = {
          ...working,
          state: LvRestWindowState.RESTING,
          lastTransitionAt: event.at,
          lastEventType: LvRestWindowEventType.REST_SNAPSHOT,
          confirmedRestingAt: event.signal.observedAt,
        };
        return {
          changed: true,
          previous,
          current: resting,
          reason: 'candidate_promoted_to_resting',
        };
      }

      if (working.state === LvRestWindowState.RESTING) {
        const completed = maybeComplete(working, event.at, policy);
        if (completed) {
          return {
            changed: true,
            previous,
            current: completed,
            reason: 'rest_window_stability_completed',
          };
        }
        if (
          working.lastEventType === LvRestWindowEventType.REST_SNAPSHOT &&
          working.lastTransitionAt.getTime() === event.at.getTime()
        ) {
          return {
            changed: false,
            previous,
            current: working,
            reason: 'duplicate_rest_snapshot',
          };
        }
        return {
          changed: true,
          previous,
          current: {
            ...working,
            lastTransitionAt: event.at,
            lastEventType: LvRestWindowEventType.REST_SNAPSHOT,
          },
          reason: 'resting_snapshot_refresh',
        };
      }

      return {
        changed: false,
        previous,
        current: working,
        reason: 'rest_snapshot_ignored',
      };
    }

    case LvRestWindowEventType.WAKE_DETECTED:
    case LvRestWindowEventType.CHARGING_DETECTED:
    case LvRestWindowEventType.NEW_TRIP_STARTED: {
      if (!working || TERMINAL_STATES.has(working.state)) {
        return {
          changed: false,
          previous,
          current: working,
          reason: 'no_open_rest_window',
        };
      }
      const reason =
        event.type === LvRestWindowEventType.WAKE_DETECTED
          ? 'wake_detected'
          : event.type === LvRestWindowEventType.CHARGING_DETECTED
            ? 'charging_detected'
            : 'new_trip_started';
      return {
        changed: true,
        previous,
        current: invalidate(working, event.at, reason, event.type),
        reason,
      };
    }

    case LvRestWindowEventType.REST_WINDOW_EXPIRED: {
      if (!working || TERMINAL_STATES.has(working.state)) {
        return {
          changed: false,
          previous,
          current: working,
          reason: 'no_open_rest_window',
        };
      }
      return {
        changed: true,
        previous,
        current: {
          ...working,
          state: LvRestWindowState.EXPIRED,
          lastTransitionAt: event.at,
          invalidatedReason: 'rest_window_expired',
          lastEventType: event.type,
        },
        reason: 'rest_window_expired',
      };
    }

    case LvRestWindowEventType.PROVIDER_ERROR:
      return {
        changed: false,
        previous,
        current: working,
        reason: 'provider_error_no_open_window',
      };

    default:
      return {
        changed: false,
        previous,
        current: working,
        reason: 'unknown_event',
      };
  }
}

export function parseLvRestWindowRecord(
  session: {
    id: string;
    startedAt: Date;
    tripId: string | null;
    idempotencyKey: string;
    metadata: unknown;
  },
  state: LvRestWindowState,
): LvRestWindowRecord {
  const metadata =
    session.metadata && typeof session.metadata === 'object'
      ? (session.metadata as Record<string, unknown>)
      : {};
  const anchorRaw = metadata.anchorAt;
  const anchorAt =
    typeof anchorRaw === 'string'
      ? new Date(anchorRaw)
      : session.startedAt;
  const lastTransitionRaw = metadata.lastTransitionAt;
  const lastTransitionAt =
    typeof lastTransitionRaw === 'string'
      ? new Date(lastTransitionRaw)
      : session.startedAt;
  const confirmedRaw = metadata.confirmedRestingAt;
  const confirmedRestingAt =
    typeof confirmedRaw === 'string' ? new Date(confirmedRaw) : null;

  return {
    windowId: session.idempotencyKey,
    state,
    anchorAt,
    startedAt: session.startedAt,
    lastTransitionAt,
    tripId: session.tripId,
    invalidatedReason:
      typeof metadata.invalidatedReason === 'string'
        ? metadata.invalidatedReason
        : null,
    lastEventType:
      typeof metadata.lastEventType === 'string'
        ? (metadata.lastEventType as LvRestWindowEventType)
        : null,
    confirmedRestingAt,
  };
}

export function mapSessionStatusToLvRestWindowState(
  status: string,
  metadataState?: string | null,
): LvRestWindowState | null {
  if (metadataState && (Object.values(LvRestWindowState) as string[]).includes(metadataState)) {
    return metadataState as LvRestWindowState;
  }
  switch (status) {
    case 'PLANNED':
      return LvRestWindowState.CANDIDATE;
    case 'ACTIVE':
      return LvRestWindowState.RESTING;
    case 'INVALID':
      return LvRestWindowState.INVALIDATED;
    case 'COMPLETED':
      return LvRestWindowState.COMPLETED;
    case 'MISSED':
      return LvRestWindowState.EXPIRED;
    default:
      return null;
  }
}
