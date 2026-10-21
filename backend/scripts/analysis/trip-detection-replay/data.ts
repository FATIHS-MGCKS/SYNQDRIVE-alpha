/**
 * TSV loaders + interval algebra for the replay harness.
 *
 * Input files are read-only extracts taken from production with SELECT-only
 * queries. See README.md for the extraction commands.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DetectionProfile,
  GroundTruthDrive,
  Interval,
  MinuteAgg,
  RpmCandidate,
  SignalName,
  StateChange,
  Trip,
  VehicleRow,
} from './types';

function readTsv(dir: string, file: string): string[][] {
  const raw = readFileSync(join(dir, file), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split('\t'));
}

/**
 * Production timestamps are UTC but serialized without a zone marker.
 * Appending `Z` keeps the harness independent of the host timezone.
 */
function parseUtc(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
}

function numOrNull(value: string): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface Dataset {
  vehicles: Map<string, VehicleRow>;
  stateChanges: Map<string, StateChange[]>;
  trips: Map<string, Trip[]>;
  minutes: Map<string, MinuteAgg[]>;
  rpmCandidates: RpmCandidate[];
}

export function loadDataset(dir: string): Dataset {
  const vehicles = new Map<string, VehicleRow>();
  for (const row of readTsv(dir, 'vehicles.tsv')) {
    const [id, plate, fuelType, profile, dimoTokenId, organizationId, hardwareType] = row;
    vehicles.set(id, {
      id,
      plate,
      fuelType,
      profile: (profile || 'UNKNOWN') as DetectionProfile,
      dimoTokenId,
      organizationId,
      hardwareType,
    });
  }

  const stateChanges = new Map<string, StateChange[]>();
  for (const row of readTsv(dir, 'state_changes.tsv')) {
    const [vehicleId, signal, changedAt, newValue] = row;
    const change: StateChange = {
      vehicleId,
      signal: signal as SignalName,
      changedAt: parseUtc(changedAt),
      newValue: Number(newValue),
    };
    if (!Number.isFinite(change.changedAt)) continue;
    const list = stateChanges.get(vehicleId) ?? [];
    list.push(change);
    stateChanges.set(vehicleId, list);
  }
  for (const list of stateChanges.values()) {
    list.sort((a, b) => a.changedAt - b.changedAt);
  }

  const trips = new Map<string, Trip[]>();
  for (const row of readTsv(dir, 'trips.tsv')) {
    const [
      id,
      vehicleId,
      start,
      end,
      status,
      source,
      distanceKm,
      dimoSegmentId,
      isRepaired,
      createdAt,
    ] = row;
    const trip: Trip = {
      id,
      vehicleId,
      start: parseUtc(start),
      end: end ? parseUtc(end) : null,
      status,
      source,
      distanceKm: numOrNull(distanceKm),
      dimoSegmentId: dimoSegmentId || null,
      isRepaired: isRepaired === 'true',
      createdAt: parseUtc(createdAt),
    };
    if (!Number.isFinite(trip.start)) continue;
    const list = trips.get(vehicleId) ?? [];
    list.push(trip);
    trips.set(vehicleId, list);
  }
  for (const list of trips.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  const minutes = new Map<string, MinuteAgg[]>();
  for (const row of readTsv(dir, 'minute_agg.tsv')) {
    const [vehicleId, minute, maxSpeed, avgSpeed, samples, odoMax, odoMin] = row;
    const agg: MinuteAgg = {
      vehicleId,
      minute: parseUtc(minute),
      maxSpeed: numOrNull(maxSpeed),
      avgSpeed: numOrNull(avgSpeed),
      samples: Number(samples) || 0,
      odoMax: numOrNull(odoMax),
      odoMin: numOrNull(odoMin),
    };
    if (!Number.isFinite(agg.minute)) continue;
    const list = minutes.get(vehicleId) ?? [];
    list.push(agg);
    minutes.set(vehicleId, list);
  }
  for (const list of minutes.values()) {
    list.sort((a, b) => a.minute - b.minute);
  }

  const rpmCandidates: RpmCandidate[] = [];
  for (const row of readTsv(dir, 'rpm_candidates.tsv')) {
    const [id, vehicleId, observedAt, observedValue, tripId, status] = row;
    rpmCandidates.push({
      id,
      vehicleId,
      observedAt: parseUtc(observedAt),
      observedValue: Number(observedValue),
      tripId: tripId || null,
      status,
    });
  }

  return { vehicles, stateChanges, trips, minutes, rpmCandidates };
}

// ─── interval algebra ───────────────────────────────────────────────────────

export function normalizeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0] }];
  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Merges intervals separated by less than `gapMs` into a single envelope. */
export function coalesce(intervals: Interval[], gapMs: number): Interval[][] {
  const normalized = normalizeIntervals(intervals);
  if (normalized.length === 0) return [];
  const groups: Interval[][] = [[normalized[0]]];
  for (const current of normalized.slice(1)) {
    const group = groups[groups.length - 1];
    const previous = group[group.length - 1];
    if (current.start - previous.end <= gapMs) {
      group.push(current);
    } else {
      groups.push([current]);
    }
  }
  return groups;
}

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

export function subtract(base: Interval, covers: Interval[]): Interval[] {
  const normalized = normalizeIntervals(
    covers.map((cover) => intersect(base, cover)).filter((x): x is Interval => x !== null),
  );
  const remaining: Interval[] = [];
  let cursor = base.start;
  for (const cover of normalized) {
    if (cover.start > cursor) remaining.push({ start: cursor, end: cover.start });
    cursor = Math.max(cursor, cover.end);
  }
  if (cursor < base.end) remaining.push({ start: cursor, end: base.end });
  return remaining;
}

export function totalMs(intervals: Interval[]): number {
  return normalizeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

// ─── telemetry helpers ──────────────────────────────────────────────────────

export function minutesInRange(
  minutes: MinuteAgg[] | undefined,
  from: number,
  to: number,
): MinuteAgg[] {
  if (!minutes) return [];
  return minutes.filter((m) => m.minute >= from - 60_000 && m.minute <= to);
}

export function maxSpeedInRange(
  minutes: MinuteAgg[] | undefined,
  from: number,
  to: number,
): number | null {
  const slice = minutesInRange(minutes, from, to);
  if (slice.length === 0) return null;
  const speeds = slice.map((m) => m.maxSpeed ?? 0);
  return speeds.length ? Math.max(...speeds) : null;
}

export function samplesInRange(
  minutes: MinuteAgg[] | undefined,
  from: number,
  to: number,
): number {
  return minutesInRange(minutes, from, to).reduce((sum, m) => sum + m.samples, 0);
}

/**
 * Longest continuous run of minutes with no movement inside the interval.
 * Used to detect a parking period that a coalescing rule must not bridge.
 */
export function longestStationaryRunMs(
  minutes: MinuteAgg[] | undefined,
  from: number,
  to: number,
  movingSpeedKmh = 1,
): number {
  const slice = minutesInRange(minutes, from, to);
  if (slice.length === 0) return 0;
  let longest = 0;
  let runStart: number | null = null;
  let previous: number | null = null;
  for (const m of slice) {
    const moving = (m.maxSpeed ?? 0) >= movingSpeedKmh;
    if (moving) {
      if (runStart !== null && previous !== null) {
        longest = Math.max(longest, previous + 60_000 - runStart);
      }
      runStart = null;
    } else if (runStart === null) {
      runStart = m.minute;
    }
    previous = m.minute;
  }
  if (runStart !== null && previous !== null) {
    longest = Math.max(longest, previous + 60_000 - runStart);
  }
  return longest;
}

// ─── ground truth reconstruction ────────────────────────────────────────────

export const MAX_PLAUSIBLE_DRIVE_MS = 4 * 3600_000;
export const COALESCE_GAP_MS = 180_000;
export const MIN_DRIVE_MS = 5 * 60_000;

/**
 * Pairs ON/OFF transitions with an unbounded state machine — the reference
 * reconstruction the production detector is measured against. Intervals with no
 * closing transition, or longer than `MAX_PLAUSIBLE_DRIVE_MS`, are telemetry
 * artifacts and are reported separately rather than counted as drives.
 */
export function reconstructSignalIntervals(
  changes: StateChange[],
  signal: SignalName,
): { intervals: Interval[]; artifacts: Interval[] } {
  const relevant = changes.filter((c) => c.signal === signal);
  const intervals: Interval[] = [];
  const artifacts: Interval[] = [];
  let openAt: number | null = null;

  for (const change of relevant) {
    if (change.newValue === 1) {
      if (openAt === null) openAt = change.changedAt;
      continue;
    }
    if (openAt !== null) {
      const interval = { start: openAt, end: change.changedAt };
      if (interval.end - interval.start > MAX_PLAUSIBLE_DRIVE_MS) {
        artifacts.push(interval);
      } else if (interval.end > interval.start) {
        intervals.push(interval);
      }
      openAt = null;
    }
  }
  if (openAt !== null) {
    artifacts.push({ start: openAt, end: openAt });
  }

  return { intervals, artifacts };
}

/**
 * Splits an envelope at internal stationary runs of at least `COALESCE_GAP_MS`.
 *
 * A drive unit must mean the same thing to the ground truth as it does to the
 * product: production already splits a live trip at a stationary mid-gap of
 * TRIP_MID_GAP_SPLIT_MS, so an envelope spanning a five-minute stop is two
 * drives, not one. Without this the harness would charge the detector for
 * failing to "cover" time the vehicle was parked.
 */
export function splitEnvelopeAtStops(
  envelope: Interval,
  minutes: MinuteAgg[] | undefined,
  stopMs = COALESCE_GAP_MS,
): Interval[] {
  const slice = minutesInRange(minutes, envelope.start, envelope.end);
  if (slice.length === 0) return [envelope];

  const stops: Interval[] = [];
  let runStart: number | null = null;
  let previous: number | null = null;
  for (const m of slice) {
    const moving = (m.maxSpeed ?? 0) >= 1;
    if (moving) {
      if (runStart !== null && previous !== null && previous + 60_000 - runStart >= stopMs) {
        stops.push({ start: runStart, end: previous + 60_000 });
      }
      runStart = null;
    } else if (runStart === null) {
      runStart = m.minute;
    }
    previous = m.minute;
  }
  if (runStart !== null && previous !== null && previous + 60_000 - runStart >= stopMs) {
    stops.push({ start: runStart, end: previous + 60_000 });
  }
  if (stops.length === 0) return [envelope];

  const pieces: Interval[] = [];
  let cursor = envelope.start;
  for (const stop of stops) {
    const end = Math.min(stop.start, envelope.end);
    if (end > cursor) pieces.push({ start: cursor, end });
    cursor = Math.max(cursor, Math.min(stop.end, envelope.end));
  }
  if (cursor < envelope.end) pieces.push({ start: cursor, end: envelope.end });
  return pieces.length > 0 ? pieces : [envelope];
}

export function buildGroundTruthDrives(
  dataset: Dataset,
  windowFrom: number,
  windowTo: number,
): { drives: GroundTruthDrive[]; artifactCount: number } {
  const drives: GroundTruthDrive[] = [];
  let artifactCount = 0;

  for (const [vehicleId, vehicle] of dataset.vehicles) {
    const changes = dataset.stateChanges.get(vehicleId);
    if (!changes || changes.length === 0) continue;
    if (vehicle.plate.startsWith('STG-')) continue;

    const ignition = reconstructSignalIntervals(changes, 'ignition');
    const motion = reconstructSignalIntervals(changes, 'motion');
    artifactCount += ignition.artifacts.length + motion.artifacts.length;

    const tagged = [
      ...ignition.intervals.map((i) => ({ ...i, signal: 'ignition' as SignalName })),
      ...motion.intervals.map((i) => ({ ...i, signal: 'motion' as SignalName })),
    ];
    const groups = coalesce(tagged, COALESCE_GAP_MS);
    const minutes = dataset.minutes.get(vehicleId);

    for (const group of groups) {
      const envelope = { start: group[0].start, end: group[group.length - 1].end };
      if (envelope.start < windowFrom || envelope.end > windowTo) continue;

      for (const unit of splitEnvelopeAtStops(envelope, minutes)) {
        if (unit.end - unit.start < MIN_DRIVE_MS) continue;

        const sources = new Set<SignalName>();
        for (const fragment of tagged) {
          if (fragment.start < unit.end && fragment.end > unit.start) sources.add(fragment.signal);
        }
        const maxSpeed = maxSpeedInRange(minutes, unit.start, unit.end);
        const samples = samplesInRange(minutes, unit.start, unit.end);
        const movementProven = sources.has('motion') || (maxSpeed ?? 0) > 1;

        drives.push({
          vehicleId,
          start: unit.start,
          end: unit.end,
          sources: [...sources],
          fragmentCount: group.length,
          maxSpeedKmh: maxSpeed,
          telemetrySamples: samples,
          movementProven,
        });
      }
    }
  }

  drives.sort((a, b) => a.start - b.start);
  return { drives, artifactCount };
}
