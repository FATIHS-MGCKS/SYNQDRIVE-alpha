/**
 * Offline, read-only replay harness for SynqDrive trip detection.
 *
 *   npx ts-node scripts/analysis/trip-detection-replay/replay.ts --data <dir>
 *
 * Reconstructs evidence-backed drives from exported production telemetry,
 * measures how much of that driving the canonical `vehicle_trips` table
 * represents, then replays both the current and the proposed detection
 * semantics over the same evidence to produce a measurable before/after.
 *
 * Performs no network calls and no writes to any datastore.
 */

import { writeFileSync } from 'node:fs';
import {
  buildGroundTruthDrives,
  loadDataset,
  longestStationaryRunMs,
  maxSpeedInRange,
  normalizeIntervals,
  samplesInRange,
  subtract,
  reconstructSignalIntervals,
  totalMs,
} from './data';
import {
  buildTierRuns,
  collectRepairCandidatesBaseline,
  findSegmentsWindowBounded,
  overlapTriggered,
} from './baseline';
import { assessOverlap, runProposedWindow } from './proposed';
import type { CoverageResult, GapShape, GroundTruthDrive, Interval, Trip } from './types';
import { SHAPE } from './types';

const args = process.argv.slice(2);
const dataDir = args[args.indexOf('--data') + 1] ?? '/tmp/replay_data';
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const ANALYSIS_DAYS = 90;

const dataset = loadDataset(dataDir);

const allTimestamps = [...dataset.trips.values()].flat().map((t) => t.start);
const dataMax = Math.max(...allTimestamps, ...[...dataset.stateChanges.values()].flat().map((c) => c.changedAt));
const windowTo = dataMax;
const windowFrom = windowTo - ANALYSIS_DAYS * 24 * 3600_000;

const { drives, artifactCount } = buildGroundTruthDrives(dataset, windowFrom, windowTo);

// ─── coverage ───────────────────────────────────────────────────────────────

function canonicalCovers(trips: Trip[], drive: Interval): Interval[] {
  return normalizeIntervals(
    trips
      .filter((t) => t.status !== 'CANCELLED' && t.end !== null)
      .map((t) => ({ start: t.start, end: t.end as number }))
      .filter((i) => i.start < drive.end && i.end > drive.start),
  );
}

function computeCoverage(drive: GroundTruthDrive, trips: Trip[]): CoverageResult {
  const covers = canonicalCovers(trips, drive);
  const movementSeconds = (drive.end - drive.start) / 1000;
  const clipped = covers
    .map((c) => ({ start: Math.max(c.start, drive.start), end: Math.min(c.end, drive.end) }))
    .filter((i) => i.end > i.start);
  const coverageSeconds = totalMs(clipped) / 1000;
  const uncovered = subtract(drive, covers);

  let prefix = 0;
  let suffix = 0;
  let interior = 0;
  for (const span of uncovered) {
    const seconds = (span.end - span.start) / 1000;
    if (span.start === drive.start) prefix += seconds;
    else if (span.end === drive.end) suffix += seconds;
    else interior += seconds;
  }

  return {
    movementSeconds,
    coverageSeconds,
    coverageRatio: movementSeconds > 0 ? coverageSeconds / movementSeconds : 1,
    missingSeconds: movementSeconds - coverageSeconds,
    prefixMissingSeconds: prefix,
    suffixMissingSeconds: suffix,
    interiorMissingSeconds: interior,
    longestUncoveredSpanSeconds: uncovered.reduce(
      (max, span) => Math.max(max, (span.end - span.start) / 1000),
      0,
    ),
    canonicalTripCount: clipped.length,
    uncovered,
  };
}

function classifyShape(coverage: CoverageResult): GapShape {
  if (coverage.missingSeconds < 60) return SHAPE.HEALTHY;
  if (coverage.coverageSeconds === 0) return SHAPE.FULL_MISS;
  const spans = coverage.uncovered.filter((s) => s.end - s.start >= 60_000);
  if (spans.length > 1) return SHAPE.MULTI_GAP;
  if (coverage.prefixMissingSeconds >= 60) return SHAPE.PREFIX_TRUNCATION;
  if (coverage.suffixMissingSeconds >= 60) return SHAPE.SUFFIX_TRUNCATION;
  return SHAPE.INTERIOR_GAP;
}

const MIN_GAP_SECONDS = 5 * 60;

const baselineDrives = drives.map((drive) => {
  const trips = dataset.trips.get(drive.vehicleId) ?? [];
  const coverage = computeCoverage(drive, trips);
  return { drive, coverage, shape: classifyShape(coverage) };
});

const gapDrives = baselineDrives.filter(
  (row) => row.drive.movementProven && row.coverage.missingSeconds >= MIN_GAP_SECONDS,
);

// ─── simulation ─────────────────────────────────────────────────────────────

interface SimResult {
  createdTrips: Map<string, Interval[]>;
  proposals: number;
  duplicatesSuppressed: number;
  ambiguous: number;
  rejected: number;
}

function vehicleActiveNear(vehicleId: string, at: number): boolean {
  const changes = dataset.stateChanges.get(vehicleId) ?? [];
  const recentChange = changes.some((c) => c.changedAt >= at - 3600_000 && c.changedAt <= at);
  if (recentChange) return true;
  const minutes = dataset.minutes.get(vehicleId) ?? [];
  return minutes.some((m) => m.minute >= at - 3600_000 && m.minute <= at);
}

/**
 * `coverage_only` isolates PR A: candidate collection, pairing and the
 * confidence gate are exactly today's, and only the suppression decision is
 * containment-aware. It is what shipping PR A with
 * TRIP_REPAIR_COVERAGE_MODE=enforce would do, and nothing more.
 *
 * `no_suppression` is the attribution control for it: today's candidates with
 * suppression removed entirely. Anything wrong that `coverage_only` emits must
 * also appear here, which is what proves the defect lives in pairing/confidence
 * rather than in the coverage rule.
 */
type SimMode = 'baseline' | 'coverage_only' | 'no_suppression' | 'proposed';

function simulate(mode: SimMode, phaseOffsetMs: number): SimResult {
  const created = new Map<string, Interval[]>();
  const simulatedTrips = new Map<string, Trip[]>();
  for (const [vehicleId, trips] of dataset.trips) {
    simulatedTrips.set(vehicleId, [...trips]);
  }

  const result: SimResult = {
    createdTrips: created,
    proposals: 0,
    duplicatesSuppressed: 0,
    ambiguous: 0,
    rejected: 0,
  };

  const runs = buildTierRuns(windowFrom, windowTo, phaseOffsetMs);

  for (const run of runs) {
    for (const [vehicleId, vehicle] of dataset.vehicles) {
      if (vehicle.plate.startsWith('STG-')) continue;
      const changes = dataset.stateChanges.get(vehicleId);
      if (!changes || changes.length === 0) continue;
      if (run.tier === 'fast' && !vehicleActiveNear(vehicleId, run.to)) continue;

      const trips = simulatedTrips.get(vehicleId) ?? [];
      const minutes = dataset.minutes.get(vehicleId);

      if (mode === 'baseline') {
        const candidates = collectRepairCandidatesBaseline(changes, vehicle.profile, run.from, run.to);
        for (const candidate of candidates) {
          if (overlapTriggered(trips, candidate)) {
            result.duplicatesSuppressed++;
            continue;
          }
          result.proposals++;
          if (candidate.confidence === 'LOW') {
            result.rejected++;
            continue;
          }
          appendCreated(created, simulatedTrips, vehicleId, candidate);
        }
      } else if (mode === 'no_suppression') {
        const candidates = collectRepairCandidatesBaseline(changes, vehicle.profile, run.from, run.to);
        for (const candidate of candidates) {
          result.proposals++;
          if (candidate.confidence === 'LOW') {
            result.rejected++;
            continue;
          }
          appendCreated(created, simulatedTrips, vehicleId, candidate);
        }
      } else if (mode === 'coverage_only') {
        const candidates = collectRepairCandidatesBaseline(changes, vehicle.profile, run.from, run.to);
        for (const candidate of candidates) {
          const assessment = assessOverlap(candidate, trips);
          if (assessment.verdict === 'DUPLICATE') {
            result.duplicatesSuppressed++;
            continue;
          }
          if (assessment.verdict === 'AMBIGUOUS') {
            result.ambiguous++;
            continue;
          }
          for (const span of assessment.repairableSpans) {
            result.proposals++;
            // Confidence stays exactly as production resolves it today.
            if (candidate.confidence === 'LOW') {
              result.rejected++;
              continue;
            }
            appendCreated(created, simulatedTrips, vehicleId, span);
          }
        }
      } else {
        const outcome = runProposedWindow({
          changes,
          minutes,
          trips,
          vehicleId,
          from: run.from,
          to: run.to,
        });
        result.duplicatesSuppressed += outcome.duplicates;
        result.ambiguous += outcome.ambiguous;
        result.rejected += outcome.rejected;
        for (const proposal of outcome.proposals) {
          result.proposals++;
          appendCreated(created, simulatedTrips, vehicleId, proposal);
        }
      }
    }
  }

  return result;
}

function appendCreated(
  created: Map<string, Interval[]>,
  simulatedTrips: Map<string, Trip[]>,
  vehicleId: string,
  interval: Interval,
): void {
  const list = created.get(vehicleId) ?? [];
  list.push({ start: interval.start, end: interval.end });
  created.set(vehicleId, list);

  const trips = simulatedTrips.get(vehicleId) ?? [];
  trips.push({
    id: `sim-${vehicleId}-${interval.start}`,
    vehicleId,
    start: interval.start,
    end: interval.end,
    status: 'COMPLETED',
    source: 'REPAIRED',
    distanceKm: null,
    dimoSegmentId: null,
    isRepaired: true,
    createdAt: interval.end,
  });
  trips.sort((a, b) => a.start - b.start);
  simulatedTrips.set(vehicleId, trips);
}

function coverageAfter(sim: SimResult): {
  recoveredDrives: number;
  recoveredSeconds: number;
  residualSeconds: number;
  fullyRecovered: number;
} {
  let recoveredDrives = 0;
  let recoveredSeconds = 0;
  let residualSeconds = 0;
  let fullyRecovered = 0;

  for (const row of gapDrives) {
    const extra = (sim.createdTrips.get(row.drive.vehicleId) ?? []).filter(
      (i) => i.start < row.drive.end && i.end > row.drive.start,
    );
    const stillMissing = subtract(
      row.drive,
      normalizeIntervals([
        ...canonicalCovers(dataset.trips.get(row.drive.vehicleId) ?? [], row.drive),
        ...extra,
      ]),
    );
    const stillMissingSeconds = totalMs(stillMissing) / 1000;
    const recovered = row.coverage.missingSeconds - stillMissingSeconds;
    if (recovered >= 60) recoveredDrives++;
    if (stillMissingSeconds < MIN_GAP_SECONDS) fullyRecovered++;
    recoveredSeconds += Math.max(0, recovered);
    residualSeconds += stillMissingSeconds;
  }

  return { recoveredDrives, recoveredSeconds, residualSeconds, fullyRecovered };
}

// ─── quality checks on the proposed output ──────────────────────────────────

function auditProposed(sim: SimResult): {
  falsePositives: number;
  falseMerges: number;
  overlapsExisting: number;
  degenerateContainments: number;
  touchingHealthyDrives: number;
  totalCreated: number;
  overlapExamples: string[];
  degenerateExamples: string[];
} {
  let falsePositives = 0;
  let falseMerges = 0;
  let overlapsExisting = 0;
  let degenerateContainments = 0;
  let touchingHealthyDrives = 0;
  let totalCreated = 0;
  const overlapExamples: string[] = [];
  const degenerateExamples: string[] = [];

  const healthy = baselineDrives.filter((row) => row.shape === SHAPE.HEALTHY);

  for (const [vehicleId, intervals] of sim.createdTrips) {
    const minutes = dataset.minutes.get(vehicleId);
    const canonical = (dataset.trips.get(vehicleId) ?? []).filter(
      (t) => t.status !== 'CANCELLED' && t.end !== null,
    );
    // A canonical row with start_time == end_time claims no driving time. It is
    // a MID_TRIP_GAP_SPLIT artifact, not coverage, so containing one is not a
    // double-representation of any second of driving.
    const trips = canonical.filter((t) => (t.end as number) > t.start);
    const degenerate = canonical.filter((t) => (t.end as number) <= t.start);

    for (const interval of intervals) {
      totalCreated++;

      const maxSpeed = maxSpeedInRange(minutes, interval.start, interval.end);
      const samples = samplesInRange(minutes, interval.start, interval.end);
      if (samples > 0 && (maxSpeed ?? 0) <= 1) falsePositives++;

      if (longestStationaryRunMs(minutes, interval.start, interval.end) >= 10 * 60_000) {
        falseMerges++;
      }

      const clash = trips.find((t) => t.start < interval.end && (t.end as number) > interval.start);
      if (clash) {
        overlapsExisting++;
        overlapExamples.push(
          `${vehicleId.slice(0, 8)} proposal ${new Date(interval.start).toISOString()}→${new Date(interval.end).toISOString()} vs trip ${clash.id.slice(0, 8)} ${new Date(clash.start).toISOString()}→${new Date(clash.end as number).toISOString()} (${clash.status}/${clash.source})`,
        );
      }

      const point = degenerate.find((t) => t.start >= interval.start && t.start <= interval.end);
      if (point) {
        degenerateContainments++;
        degenerateExamples.push(
          `${vehicleId.slice(0, 8)} proposal ${new Date(interval.start).toISOString()}→${new Date(interval.end).toISOString()} contains zero-duration trip ${point.id.slice(0, 8)} @ ${new Date(point.start).toISOString()}`,
        );
      }

      if (
        healthy.some(
          (row) =>
            row.drive.vehicleId === vehicleId &&
            row.drive.start < interval.end &&
            row.drive.end > interval.start,
        )
      ) {
        touchingHealthyDrives++;
      }
    }
  }

  return {
    falsePositives,
    falseMerges,
    overlapsExisting,
    degenerateContainments,
    touchingHealthyDrives,
    totalCreated,
    overlapExamples,
    degenerateExamples,
  };
}

// ─── run ────────────────────────────────────────────────────────────────────

const PHASES = [0, 3, 6, 9, 12].map((m) => m * 60_000);

const baselineRuns = PHASES.map((phase) => ({ phase, sim: simulate('baseline', phase) }));
const coverageOnlyRuns = PHASES.map((phase) => ({ phase, sim: simulate('coverage_only', phase) }));
const noSuppressionRuns = PHASES.map((phase) => ({ phase, sim: simulate('no_suppression', phase) }));
const proposedRuns = PHASES.map((phase) => ({ phase, sim: simulate('proposed', phase) }));

const hours = (seconds: number) => (seconds / 3600).toFixed(2);

const totalMissingSeconds = gapDrives.reduce((sum, row) => sum + row.coverage.missingSeconds, 0);

console.log('═══ PART 2 — GROUND TRUTH AND COVERAGE ═══');
console.log(`analysis window       : ${new Date(windowFrom).toISOString()} → ${new Date(windowTo).toISOString()}`);
console.log(`evidence-backed drives: ${drives.length} (movement-proven ${drives.filter((d) => d.movementProven).length})`);
console.log(`telemetry artifacts   : ${artifactCount} unpaired/over-long ON edges (excluded)`);
console.log(`drives with >=5min missing: ${gapDrives.length}`);
console.log(`total missing time    : ${hours(totalMissingSeconds)} h`);
console.log(`vehicles affected     : ${new Set(gapDrives.map((r) => r.drive.vehicleId)).size}`);

console.log('\n── shape distribution ──');
const shapeCounts = new Map<GapShape, { count: number; seconds: number }>();
for (const row of gapDrives) {
  const entry = shapeCounts.get(row.shape) ?? { count: 0, seconds: 0 };
  entry.count++;
  entry.seconds += row.coverage.missingSeconds;
  shapeCounts.set(row.shape, entry);
}
for (const [shape, entry] of [...shapeCounts].sort((a, b) => b[1].seconds - a[1].seconds)) {
  console.log(`  ${shape.padEnd(20)} ${String(entry.count).padStart(3)} drives  ${hours(entry.seconds).padStart(7)} h`);
}

console.log('\n── per vehicle ──');
const perVehicle = new Map<string, { count: number; seconds: number }>();
for (const row of gapDrives) {
  const entry = perVehicle.get(row.drive.vehicleId) ?? { count: 0, seconds: 0 };
  entry.count++;
  entry.seconds += row.coverage.missingSeconds;
  perVehicle.set(row.drive.vehicleId, entry);
}
for (const [vehicleId, entry] of [...perVehicle].sort((a, b) => b[1].seconds - a[1].seconds)) {
  const vehicle = dataset.vehicles.get(vehicleId);
  console.log(
    `  ${vehicleId.slice(0, 8)} ${(vehicle?.plate ?? '?').padEnd(14)} ${(vehicle?.profile ?? '?').padEnd(8)} ${String(entry.count).padStart(3)} drives  ${hours(entry.seconds).padStart(7)} h`,
  );
}

console.log('\n── per month ──');
const perMonth = new Map<string, { count: number; seconds: number }>();
for (const row of gapDrives) {
  const key = new Date(row.drive.start).toISOString().slice(0, 7);
  const entry = perMonth.get(key) ?? { count: 0, seconds: 0 };
  entry.count++;
  entry.seconds += row.coverage.missingSeconds;
  perMonth.set(key, entry);
}
for (const [month, entry] of [...perMonth].sort()) {
  console.log(`  ${month}  ${String(entry.count).padStart(3)} drives  ${hours(entry.seconds).padStart(7)} h`);
}

// Reproduction of the 2026-08-28 forensic audit methodology, for continuity:
// raw ignition ON→OFF pairs only, no coalescing, no stop splitting, plausible
// durations 5min–4h, coverage by non-cancelled trips.
console.log('\n── legacy methodology (ignition-only, no coalescing) ──');
{
  let legacyCount = 0;
  let legacySeconds = 0;
  const legacyVehicles = new Set<string>();
  for (const [vehicleId, vehicle] of dataset.vehicles) {
    if (vehicle.plate.startsWith('STG-')) continue;
    const changes = dataset.stateChanges.get(vehicleId);
    if (!changes) continue;
    const { intervals } = reconstructSignalIntervals(changes, 'ignition');
    const trips = dataset.trips.get(vehicleId) ?? [];
    for (const interval of intervals) {
      const durationMs = interval.end - interval.start;
      if (interval.start < windowFrom || interval.end > windowTo) continue;
      if (durationMs < 5 * 60_000 || durationMs > 4 * 3600_000) continue;
      const covers = canonicalCovers(trips, interval);
      const missingSeconds = totalMs(subtract(interval, covers)) / 1000;
      if (missingSeconds >= MIN_GAP_SECONDS) {
        legacyCount++;
        legacySeconds += missingSeconds;
        legacyVehicles.add(vehicleId);
      }
    }
  }
  console.log(
    `  state-machine pairing : ${legacyCount} drives, ${hours(legacySeconds)} h missing, ${legacyVehicles.size} vehicles`,
  );
}
{
  // The prior audit paired with ClickHouse `leadInFrame`, which takes the next
  // row whatever its value and drops the final ON in the window. Reproducing
  // that pairing isolates how much of the delta is methodology rather than data.
  let legacyCount = 0;
  let legacySeconds = 0;
  const legacyVehicles = new Set<string>();
  for (const [vehicleId, vehicle] of dataset.vehicles) {
    if (vehicle.plate.startsWith('STG-')) continue;
    const changes = dataset.stateChanges.get(vehicleId);
    if (!changes) continue;
    const trips = dataset.trips.get(vehicleId) ?? [];
    const segments = findSegmentsWindowBounded(changes, 'ignition', windowFrom, windowTo, 60_000);
    for (const interval of segments) {
      const durationMs = interval.end - interval.start;
      if (durationMs < 5 * 60_000 || durationMs > 4 * 3600_000) continue;
      const covers = canonicalCovers(trips, interval);
      const missingSeconds = totalMs(subtract(interval, covers)) / 1000;
      if (missingSeconds >= MIN_GAP_SECONDS) {
        legacyCount++;
        legacySeconds += missingSeconds;
        legacyVehicles.add(vehicleId);
      }
    }
  }
  console.log(
    `  leadInFrame pairing   : ${legacyCount} drives, ${hours(legacySeconds)} h missing, ${legacyVehicles.size} vehicles`,
  );
}
{
  // Same population, but coverage summed per trip instead of over the union of
  // trip intervals. Overlapping canonical trips are then double-counted as
  // coverage, which understates the gap. This isolates the coverage-math delta.
  let legacyCount = 0;
  let legacySeconds = 0;
  let population = 0;
  let populationSeconds = 0;
  for (const [vehicleId, vehicle] of dataset.vehicles) {
    if (vehicle.plate.startsWith('STG-')) continue;
    const changes = dataset.stateChanges.get(vehicleId);
    if (!changes) continue;
    const trips = (dataset.trips.get(vehicleId) ?? []).filter(
      (t) => t.status !== 'CANCELLED' && t.end !== null,
    );
    const { intervals } = reconstructSignalIntervals(changes, 'ignition');
    for (const interval of intervals) {
      const durationMs = interval.end - interval.start;
      if (interval.start < windowFrom || interval.end > windowTo) continue;
      if (durationMs < 5 * 60_000 || durationMs > 4 * 3600_000) continue;
      population++;
      populationSeconds += durationMs / 1000;
      const summedCoverage = trips.reduce((sum, trip) => {
        const overlaps = trip.start < interval.end && (trip.end as number) > interval.start;
        return overlaps ? sum + ((trip.end as number) - trip.start) : sum;
      }, 0);
      const missingSeconds = Math.max(0, durationMs - summedCoverage) / 1000;
      if (missingSeconds >= MIN_GAP_SECONDS) {
        legacyCount++;
        legacySeconds += missingSeconds;
      }
    }
  }
  console.log(
    `  unclipped trip duration: ${legacyCount} drives, ${hours(legacySeconds)} h missing  [population ${population} drives / ${hours(populationSeconds)} h]`,
  );
  console.log('  prior audit reported  : 49 drives, 42.70 h missing  [population 367 drives / 179.8 h]');
}

// ─── PART 3 — failure classification ────────────────────────────────────────

/**
 * Walks the current pipeline for one gap and reports the FIRST stage that
 * blocks it, so a gap is attributed to the earliest defect rather than to
 * whichever symptom is easiest to see.
 */
const LIVE_OUTAGE_FROM = Date.parse('2026-07-17T00:00:00Z');
const LIVE_OUTAGE_TO = Date.parse('2026-07-20T11:20:00Z');

type Bucket =
  | 'A_LIVE_INGESTION_ABORT'
  | 'B_FIXED_WINDOW_PAIRING'
  | 'C_SCHEDULER_PHASE'
  | 'D_CONFIDENCE_CUTOFF'
  | 'F_MOTION_SUPPRESSED'
  | 'I_OVERLAP_SUPPRESSION'
  | 'K_TRUNCATION_BOUNDARY'
  | 'N_NO_BLOCKER_FOUND';

function diagnoseGap(
  row: (typeof gapDrives)[number],
  options?: { assumeOverlapFixed?: boolean },
): {
  first: Bucket;
  contributing: Bucket[];
} {
  const { drive } = row;
  const changes = dataset.stateChanges.get(drive.vehicleId) ?? [];
  const trips = dataset.trips.get(drive.vehicleId) ?? [];
  const profile = dataset.vehicles.get(drive.vehicleId)?.profile ?? 'UNKNOWN';
  const durationMs = drive.end - drive.start;
  const contributing: Bucket[] = [];

  if (drive.start >= LIVE_OUTAGE_FROM && drive.start <= LIVE_OUTAGE_TO) {
    contributing.push('A_LIVE_INGESTION_ABORT');
  }
  if (row.shape !== SHAPE.FULL_MISS) contributing.push('K_TRUNCATION_BOUNDARY');

  // Stage 1 — can any tier window pair a candidate that covers most of the drive?
  const tiers: Array<{ name: string; windowMs: number }> = [
    { name: 'fast', windowMs: 45 * 60_000 },
    { name: 'warm', windowMs: 12 * 3600_000 },
    { name: 'cold', windowMs: 7 * 24 * 3600_000 },
  ];
  let bestCandidate: { start: number; end: number; confidence: string } | null = null;
  let fastCanPair = false;

  for (const tier of tiers) {
    for (let end = drive.end; end <= drive.end + tier.windowMs; end += 60_000) {
      const from = end - tier.windowMs;
      if (from > drive.start) continue;
      const candidates = collectRepairCandidatesBaseline(changes, profile, from, end);
      const covering = candidates.find(
        (c) => c.start <= drive.start + 60_000 && c.end >= drive.end - 60_000,
      );
      if (covering) {
        if (tier.name === 'fast') fastCanPair = true;
        if (!bestCandidate || covering.confidence === 'HIGH') {
          bestCandidate = { start: covering.start, end: covering.end, confidence: covering.confidence };
        }
        break;
      }
    }
  }

  if (!fastCanPair) {
    if (durationMs > 45 * 60_000) contributing.push('B_FIXED_WINDOW_PAIRING');
    else if (45 * 60_000 - durationMs < 15 * 60_000) contributing.push('C_SCHEDULER_PHASE');
  }

  if (!bestCandidate) {
    const first: Bucket =
      durationMs > 45 * 60_000 ? 'B_FIXED_WINDOW_PAIRING' : 'C_SCHEDULER_PHASE';
    return { first, contributing };
  }

  // Stage 2 — would the overlap detector suppress it before anything else?
  if (!options?.assumeOverlapFixed && overlapTriggered(trips, bestCandidate)) {
    contributing.push('I_OVERLAP_SUPPRESSION');
    return { first: 'I_OVERLAP_SUPPRESSION', contributing };
  }

  // Stage 3 — confidence gate.
  if (bestCandidate.confidence === 'LOW') {
    contributing.push('D_CONFIDENCE_CUTOFF');
    if (profile === 'ICE' && drive.sources.includes('motion')) {
      contributing.push('F_MOTION_SUPPRESSED');
    }
    return { first: 'D_CONFIDENCE_CUTOFF', contributing };
  }

  return { first: 'N_NO_BLOCKER_FOUND', contributing };
}

console.log('\n═══ PART 3 — FAILURE CLASSIFICATION (first blocking stage) ═══');
const firstCounts = new Map<Bucket, { count: number; seconds: number; vehicles: Set<string> }>();
const contributingCounts = new Map<Bucket, number>();
const examples = new Map<Bucket, string>();

for (const row of gapDrives) {
  const diagnosis = diagnoseGap(row);
  const entry = firstCounts.get(diagnosis.first) ?? { count: 0, seconds: 0, vehicles: new Set<string>() };
  entry.count++;
  entry.seconds += row.coverage.missingSeconds;
  entry.vehicles.add(row.drive.vehicleId);
  firstCounts.set(diagnosis.first, entry);
  if (!examples.has(diagnosis.first)) {
    examples.set(
      diagnosis.first,
      `${row.drive.vehicleId.slice(0, 8)} ${new Date(row.drive.start).toISOString().slice(0, 19)}→${new Date(row.drive.end).toISOString().slice(11, 19)} missing ${(row.coverage.missingSeconds / 60).toFixed(1)}min`,
    );
  }
  for (const bucket of new Set(diagnosis.contributing)) {
    contributingCounts.set(bucket, (contributingCounts.get(bucket) ?? 0) + 1);
  }
}

console.log('bucket                     | drives | missing h | vehicles | example');
for (const [bucket, entry] of [...firstCounts].sort((a, b) => b[1].seconds - a[1].seconds)) {
  console.log(
    `${bucket.padEnd(26)} | ${String(entry.count).padStart(6)} | ${hours(entry.seconds).padStart(9)} | ${String(entry.vehicles.size).padStart(8)} | ${examples.get(bucket)}`,
  );
}
console.log('\ncontributing factors (non-exclusive):');
for (const [bucket, count] of [...contributingCounts].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${bucket.padEnd(26)} ${count} drives`);
}

// Which defect becomes binding once containment-aware overlap lands? This is
// what determines whether the overlap rework can ship on its own.
console.log('\nsecond-order (assuming containment-aware overlap is in place):');
const secondOrder = new Map<Bucket, { count: number; seconds: number }>();
for (const row of gapDrives) {
  const diagnosis = diagnoseGap(row, { assumeOverlapFixed: true });
  const entry = secondOrder.get(diagnosis.first) ?? { count: 0, seconds: 0 };
  entry.count++;
  entry.seconds += row.coverage.missingSeconds;
  secondOrder.set(diagnosis.first, entry);
}
for (const [bucket, entry] of [...secondOrder].sort((a, b) => b[1].seconds - a[1].seconds)) {
  console.log(`  ${bucket.padEnd(26)} ${String(entry.count).padStart(3)} drives  ${hours(entry.seconds).padStart(7)} h`);
}

console.log('\n═══ PART 12 — REPLAY RESULTS ═══');
console.log('phase(min) | mode     | created | dup-suppressed | ambiguous | rejected | drives recovered | fully | recovered h | residual h');
for (const { phase, sim } of baselineRuns) {
  const after = coverageAfter(sim);
  const audit = auditProposed(sim);
  console.log(
    `${String(phase / 60_000).padStart(10)} | baseline | ${String(audit.totalCreated).padStart(7)} | ${String(sim.duplicatesSuppressed).padStart(14)} | ${String(sim.ambiguous).padStart(9)} | ${String(sim.rejected).padStart(8)} | ${String(after.recoveredDrives).padStart(16)} | ${String(after.fullyRecovered).padStart(5)} | ${hours(after.recoveredSeconds).padStart(11)} | ${hours(after.residualSeconds).padStart(10)}`,
  );
}
for (const { phase, sim } of coverageOnlyRuns) {
  const after = coverageAfter(sim);
  const audit = auditProposed(sim);
  console.log(
    `${String(phase / 60_000).padStart(10)} | cov-only | ${String(audit.totalCreated).padStart(7)} | ${String(sim.duplicatesSuppressed).padStart(14)} | ${String(sim.ambiguous).padStart(9)} | ${String(sim.rejected).padStart(8)} | ${String(after.recoveredDrives).padStart(16)} | ${String(after.fullyRecovered).padStart(5)} | ${hours(after.recoveredSeconds).padStart(11)} | ${hours(after.residualSeconds).padStart(10)}`,
  );
}
for (const { phase, sim } of noSuppressionRuns) {
  const after = coverageAfter(sim);
  const audit = auditProposed(sim);
  console.log(
    `${String(phase / 60_000).padStart(10)} | no-suppr | ${String(audit.totalCreated).padStart(7)} | ${String(sim.duplicatesSuppressed).padStart(14)} | ${String(sim.ambiguous).padStart(9)} | ${String(sim.rejected).padStart(8)} | ${String(after.recoveredDrives).padStart(16)} | ${String(after.fullyRecovered).padStart(5)} | ${hours(after.recoveredSeconds).padStart(11)} | ${hours(after.residualSeconds).padStart(10)}`,
  );
}
for (const { phase, sim } of proposedRuns) {
  const after = coverageAfter(sim);
  const audit = auditProposed(sim);
  console.log(
    `${String(phase / 60_000).padStart(10)} | proposed | ${String(audit.totalCreated).padStart(7)} | ${String(sim.duplicatesSuppressed).padStart(14)} | ${String(sim.ambiguous).padStart(9)} | ${String(sim.rejected).padStart(8)} | ${String(after.recoveredDrives).padStart(16)} | ${String(after.fullyRecovered).padStart(5)} | ${hours(after.recoveredSeconds).padStart(11)} | ${hours(after.residualSeconds).padStart(10)}`,
  );
}

console.log('\n── output quality by mode (phase 0) ──');
const audits = [
  { label: 'baseline (today)', audit: auditProposed(baselineRuns[0].sim) },
  { label: 'coverage_only (PR A alone)', audit: auditProposed(coverageOnlyRuns[0].sim) },
  { label: 'no_suppression (control)', audit: auditProposed(noSuppressionRuns[0].sim) },
  { label: 'proposed (PR A+B+C)', audit: auditProposed(proposedRuns[0].sim) },
];
console.log(
  'mode                       | created | false pos | false merges | overlaps real trip | contains 0-dur row | touches healthy',
);
for (const { label, audit } of audits) {
  console.log(
    `${label.padEnd(26)} | ${String(audit.totalCreated).padStart(7)} | ${String(audit.falsePositives).padStart(9)} | ${String(audit.falseMerges).padStart(12)} | ${String(audit.overlapsExisting).padStart(18)} | ${String(audit.degenerateContainments).padStart(18)} | ${String(audit.touchingHealthyDrives).padStart(15)}`,
  );
}

const coverageOnlyAudit = audits[1].audit;
const proposedAudit = audits[3].audit;

console.log('\n  coverage_only overlap detail:');
for (const example of coverageOnlyAudit.overlapExamples.slice(0, 5)) {
  console.log(`    overlap: ${example}`);
}
for (const example of coverageOnlyAudit.degenerateExamples.slice(0, 5)) {
  console.log(`    zero-duration: ${example}`);
}
console.log('\n  proposed overlap detail:');
for (const example of proposedAudit.overlapExamples.slice(0, 5)) {
  console.log(`    overlap: ${example}`);
}
for (const example of proposedAudit.degenerateExamples.slice(0, 5)) {
  console.log(`    zero-duration: ${example}`);
}

// The safety invariant PR A rests on: containment-aware suppression must be a
// relaxation of binary overlap, never a tightening. Checked against every
// candidate the current collector produces over the full window, not argued.
console.log('\n── invariant: coverage never suppresses what binary overlap accepts ──');
{
  let checked = 0;
  let legacyAccepted = 0;
  let violations = 0;
  const violationExamples: string[] = [];

  for (const [vehicleId, vehicle] of dataset.vehicles) {
    if (vehicle.plate.startsWith('STG-')) continue;
    const changes = dataset.stateChanges.get(vehicleId);
    if (!changes || changes.length === 0) continue;
    const trips = dataset.trips.get(vehicleId) ?? [];

    for (const run of buildTierRuns(windowFrom, windowTo, 0)) {
      for (const candidate of collectRepairCandidatesBaseline(changes, vehicle.profile, run.from, run.to)) {
        checked++;
        if (overlapTriggered(trips, candidate)) continue;
        legacyAccepted++;
        const assessment = assessOverlap(candidate, trips);
        if (assessment.verdict !== 'REPAIRABLE_GAP' || assessment.repairableSpans.length === 0) {
          violations++;
          if (violationExamples.length < 5) {
            violationExamples.push(
              `${vehicleId.slice(0, 8)} ${new Date(candidate.start).toISOString()}→${new Date(candidate.end).toISOString()} verdict=${assessment.coverageVerdict} spans=${assessment.repairableSpans.length}`,
            );
          }
        }
      }
    }
  }

  console.log(`  candidates checked         : ${checked}`);
  console.log(`  accepted by binary overlap : ${legacyAccepted}`);
  console.log(`  of those, coverage blocks  : ${violations}  ${violations === 0 ? '(invariant holds)' : '(INVARIANT VIOLATED)'}`);
  for (const example of violationExamples) console.log(`    violation: ${example}`);
}

// Audit-first ordering writes a row for suppressed proposals too, so the cost of
// the audit change is the write volume it adds. The deterministic audit id makes
// repeated evaluations of one window an update rather than an insert, which is
// what keeps trip_repairs from becoming a scheduler tick log.
console.log('\n── audit write volume introduced by audit-first ordering ──');
{
  let evaluations = 0;
  const distinctWindows = new Set<string>();

  for (const [vehicleId, vehicle] of dataset.vehicles) {
    if (vehicle.plate.startsWith('STG-')) continue;
    const changes = dataset.stateChanges.get(vehicleId);
    if (!changes || changes.length === 0) continue;
    for (const run of buildTierRuns(windowFrom, windowTo, 0)) {
      for (const candidate of collectRepairCandidatesBaseline(changes, vehicle.profile, run.from, run.to)) {
        evaluations++;
        distinctWindows.add(`${vehicleId}|${candidate.start}|${candidate.end}`);
      }
    }
  }

  const days = (windowTo - windowFrom) / 86_400_000;
  const vehicles = [...dataset.vehicles.values()].filter((v) => !v.plate.startsWith('STG-')).length;
  console.log(`  evaluations over ${days.toFixed(0)} days   : ${evaluations} (${(evaluations / days / vehicles).toFixed(1)} per vehicle per day)`);
  console.log(`  distinct audit rows        : ${distinctWindows.size} (${(distinctWindows.size / days / vehicles).toFixed(2)} inserted per vehicle per day)`);
  console.log(`  re-evaluation factor       : ${(evaluations / Math.max(1, distinctWindows.size)).toFixed(1)}x updates per insert`);
  console.log(`  projected at 1000 vehicles : ${Math.round((evaluations / days / vehicles) * 1000)} evaluations/day, ${Math.round((distinctWindows.size / days / vehicles) * 1000)} new rows/day`);
}

console.log('\n── RPM sentinels ──');
const sentinelHit = (sim: SimResult, vehicleId: string, at: number): Interval | undefined =>
  (sim.createdTrips.get(vehicleId) ?? []).find((i) => i.start <= at && i.end >= at);
const span = (i: Interval | undefined): string =>
  i
    ? `RECOVERED ${new Date(i.start).toISOString().slice(11, 19)}→${new Date(i.end).toISOString().slice(11, 19)}`
    : 'missed';

for (const candidate of dataset.rpmCandidates.filter((c) => !c.tripId)) {
  const at = candidate.observedAt;
  console.log(
    `  ${candidate.id.slice(0, 8)} ${new Date(at).toISOString().slice(0, 19)} rpm=${candidate.observedValue}` +
      ` | baseline=${span(sentinelHit(baselineRuns[0].sim, candidate.vehicleId, at))}` +
      ` | coverage_only=${span(sentinelHit(coverageOnlyRuns[0].sim, candidate.vehicleId, at))}` +
      ` | proposed=${span(sentinelHit(proposedRuns[0].sim, candidate.vehicleId, at))}`,
  );
}

if (outFile) {
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        windowFrom: new Date(windowFrom).toISOString(),
        windowTo: new Date(windowTo).toISOString(),
        driveCount: drives.length,
        gapCount: gapDrives.length,
        missingHours: Number(hours(totalMissingSeconds)),
        shapes: [...shapeCounts].map(([shape, e]) => ({ shape, count: e.count, hours: Number(hours(e.seconds)) })),
        perVehicle: [...perVehicle].map(([id, e]) => ({
          vehicleId: id,
          plate: dataset.vehicles.get(id)?.plate,
          count: e.count,
          hours: Number(hours(e.seconds)),
        })),
        baseline: baselineRuns.map(({ phase, sim }) => ({ phase: phase / 60_000, ...coverageAfter(sim) })),
        coverageOnly: coverageOnlyRuns.map(({ phase, sim }) => ({ phase: phase / 60_000, ...coverageAfter(sim) })),
        noSuppression: noSuppressionRuns.map(({ phase, sim }) => ({ phase: phase / 60_000, ...coverageAfter(sim) })),
        proposed: proposedRuns.map(({ phase, sim }) => ({ phase: phase / 60_000, ...coverageAfter(sim) })),
        quality: audits.map(({ label, audit }) => ({
          mode: label,
          created: audit.totalCreated,
          falsePositives: audit.falsePositives,
          falseMerges: audit.falseMerges,
          overlapsExisting: audit.overlapsExisting,
          degenerateContainments: audit.degenerateContainments,
          touchingHealthyDrives: audit.touchingHealthyDrives,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${outFile}`);
}
