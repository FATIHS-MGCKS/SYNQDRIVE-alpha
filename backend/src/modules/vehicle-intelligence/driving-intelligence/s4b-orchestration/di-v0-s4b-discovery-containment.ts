/**
 * S4B Tiny discovery lower-bound containment (S4F-7A). Not part of the frozen S4A contract JSON;
 * runtime policy overlay — fail-closed when unset or invalid.
 */

export const DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV = 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE';

export type DiV0S4DiscoveryContainmentUnavailableReason = 'MISSING' | 'MALFORMED' | 'EMPTY';

export type DiV0S4DiscoveryContainmentState =
  | { kind: 'UNAVAILABLE'; reason: DiV0S4DiscoveryContainmentUnavailableReason }
  | { kind: 'AVAILABLE'; notBeforeUtc: Date };

/** Tests and local fixtures: permissive lower bound so historical integration cases stay valid. */
export const DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS: DiV0S4DiscoveryContainmentState = {
  kind: 'AVAILABLE',
  notBeforeUtc: new Date('1970-01-01T00:00:00.000Z'),
};

export function parseDiV0S4DiscoveryTripEndNotBefore(
  raw: string | undefined,
  now: Date = new Date(),
): DiV0S4DiscoveryContainmentState {
  if (raw == null || raw.trim() === '') {
    return { kind: 'UNAVAILABLE', reason: 'MISSING' };
  }
  const trimmed = raw.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  const notBeforeUtc = new Date(parsed);
  if (Number.isNaN(notBeforeUtc.getTime())) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  if (trimmed.length < 10) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  if (notBeforeUtc.getTime() > now.getTime()) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  return { kind: 'AVAILABLE', notBeforeUtc };
}

export function loadDiV0S4bDiscoveryContainment(
  env: Readonly<Record<string, string | undefined>>,
): DiV0S4DiscoveryContainmentState {
  return parseDiV0S4DiscoveryTripEndNotBefore(env[DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV]);
}

export function isDiV0S4DiscoveryContainmentAvailable(
  state: DiV0S4DiscoveryContainmentState,
): state is { kind: 'AVAILABLE'; notBeforeUtc: Date } {
  return state.kind === 'AVAILABLE';
}
