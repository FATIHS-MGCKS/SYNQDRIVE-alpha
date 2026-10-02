/**
 * S4B Tiny discovery lower-bound containment (S4F-7A). Not part of the frozen S4A contract JSON;
 * runtime policy overlay — fail-closed when unset or invalid.
 */

export const DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV = 'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE';

/** Canonical activation boundary: `YYYY-MM-DDTHH:mm:ss.SSSZ` (UTC Z only). */
export const DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_CANONICAL =
  /^(?<y>\d{4})-(?<mo>\d{2})-(?<d>\d{2})T(?<h>\d{2}):(?<mi>\d{2}):(?<s>\d{2})\.(?<ms>\d{3})Z$/;

export type DiV0S4DiscoveryContainmentUnavailableReason = 'MISSING' | 'MALFORMED' | 'EMPTY';

export type DiV0S4DiscoveryContainmentState =
  | { kind: 'UNAVAILABLE'; reason: DiV0S4DiscoveryContainmentUnavailableReason }
  | { kind: 'AVAILABLE'; notBeforeUtc: Date };

/** Tests and local fixtures: permissive lower bound so historical integration cases stay valid. */
export const DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS: DiV0S4DiscoveryContainmentState = {
  kind: 'AVAILABLE',
  notBeforeUtc: new Date('1970-01-01T00:00:00.000Z'),
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return String(n);
}

/** Round-trip canonical UTC string from epoch ms (no local timezone). */
export function formatDiV0S4DiscoveryTripEndNotBeforeCanonical(epochMs: number): string {
  const d = new Date(epochMs);
  if (!Number.isFinite(epochMs) || Number.isNaN(d.getTime())) {
    throw new Error('invalid epoch');
  }
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(
    d.getUTCMinutes(),
  )}:${pad2(d.getUTCSeconds())}.${pad3(d.getUTCMilliseconds())}Z`;
}

function daysInUtcMonth(year: number, month1: number): number {
  if (month1 === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month1)) return 30;
  return 31;
}

function isValidUtcCalendar(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59 || ms > 999) return false;
  if (d > daysInUtcMonth(y, mo)) return false;
  const epoch = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  if (!Number.isFinite(epoch)) return false;
  const check = new Date(epoch);
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === mo - 1 &&
    check.getUTCDate() === d &&
    check.getUTCHours() === h &&
    check.getUTCMinutes() === mi &&
    check.getUTCSeconds() === s &&
    check.getUTCMilliseconds() === ms
  );
}

export function parseDiV0S4DiscoveryTripEndNotBefore(
  raw: string | undefined,
  now: Date = new Date(),
): DiV0S4DiscoveryContainmentState {
  if (raw == null || raw.trim() === '') {
    return { kind: 'UNAVAILABLE', reason: 'MISSING' };
  }
  const trimmed = raw.trim();
  const m = DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_CANONICAL.exec(trimmed);
  if (!m?.groups) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  const y = Number(m.groups.y);
  const mo = Number(m.groups.mo);
  const d = Number(m.groups.d);
  const h = Number(m.groups.h);
  const mi = Number(m.groups.mi);
  const s = Number(m.groups.s);
  const ms = Number(m.groups.ms);
  if (!isValidUtcCalendar(y, mo, d, h, mi, s, ms)) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  const epoch = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const canonical = formatDiV0S4DiscoveryTripEndNotBeforeCanonical(epoch);
  if (canonical !== trimmed) {
    return { kind: 'UNAVAILABLE', reason: 'MALFORMED' };
  }
  const notBeforeUtc = new Date(epoch);
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
